#!/usr/bin/env python3
"""
Bravelog scraper — 抓取 Bravelog 上指定 226K 鐵人三項賽事的女子組成績。

用法：
    python3 bravelog.py 2023031801                 # 用 contest URL slug
    python3 bravelog.py 2023031801 --out ../raw    # 指定輸出目錄
    python3 bravelog.py 2023031801 --max-hours 12  # 過濾條件（預設 12 小時）

輸出 JSON 到 raw/{slug}.json
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

BASE = "https://www.bravelog.tw"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36 "
        "(tri-ranking-scraper; contact: kobby0923-tw.github.io/tri-ranking)"
    ),
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
}
SLEEP = 1.0  # 禮貌間隔


def hms_to_seconds(s: str) -> Optional[int]:
    """HH:MM:SS -> 秒；DNF（--:--:--）或無效輸入 -> None"""
    if not s or "--" in s:
        return None
    parts = s.split(":")
    if len(parts) != 3:
        return None
    try:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except ValueError:
        return None


def fetch(url: str, retries: int = 3) -> BeautifulSoup:
    """GET with retry on timeout / 5xx / network errors."""
    print(f"  GET {url}", file=sys.stderr)
    last_exc = None
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            r.raise_for_status()
            return BeautifulSoup(r.text, "lxml")
        except (requests.Timeout, requests.ConnectionError) as e:
            last_exc = e
            wait = 2 ** attempt  # 2, 4, 8 秒退避
            print(f"      ⚠ 第 {attempt} 次失敗（{type(e).__name__}），{wait}s 後重試", file=sys.stderr)
            time.sleep(wait)
        except requests.HTTPError as e:
            if 500 <= e.response.status_code < 600 and attempt < retries:
                last_exc = e
                wait = 2 ** attempt
                print(f"      ⚠ HTTP {e.response.status_code}，{wait}s 後重試", file=sys.stderr)
                time.sleep(wait)
            else:
                raise
    raise last_exc if last_exc else RuntimeError("fetch failed")


def is_226k_individual(text: str) -> bool:
    """判斷一個 raceId 分類名稱是否為 226K 個人組（鐵人三項全程）"""
    low = text.lower()
    # 排除：半程、接力、兒童組、不是 226 的距離
    excludes = ["70.3", "relay", "接力", "小", "迷你", "寶", "兒童", "親子",
                "113", "51.5", "25.75", "111", "10k", "5k"]
    if any(x in low for x in excludes):
        return False
    # 命中：226 任何寫法 / IRONMAN（IRONMAN 標準距離就是 226）
    if "226" in text:
        return True
    if "ironman" in low:
        return True
    return False


def discover_226k_race(slug_url: str) -> tuple[int, str, str]:
    """從賽事頁面找 226K 個人組的 raceId、分類名稱、賽事完整標題"""
    soup = fetch(slug_url)
    select = soup.find("select", {"name": "raceId"})
    if not select:
        raise RuntimeError("頁面找不到 raceId 下拉選單")
    for opt in select.find_all("option"):
        text = opt.get_text(strip=True)
        value = opt.get("value", "").strip()
        if value and is_226k_individual(text):
            return int(value), text, ""
    # 出錯時印出所有選項幫忙除錯
    options = [(opt.get("value"), opt.get_text(strip=True)) for opt in select.find_all("option")]
    raise RuntimeError(f"找不到 226K 個人組。可選分類：{options}")


def find_groups(race_id: int, slug_url: str) -> tuple[list[str], bool]:
    """從賽事頁面找所有組別代號。

    若有 F-prefix（普悠瑪/Challenge/超鐵這類分性別），只回傳 F 組 -> is_gendered=True
    若沒 F-prefix（IRONMAN 標準格式年齡組混性別），回傳所有非空組 -> is_gendered=False
    （混合組需要事後到個人頁讀性別）
    """
    soup = fetch(f"{slug_url}?raceId={race_id}")
    select = soup.find("select", {"name": "group"})
    if not select:
        return [], True
    all_groups = [
        opt["value"].strip()
        for opt in select.find_all("option")
        if opt.get("value", "").strip()
    ]
    f_groups = [g for g in all_groups if g.startswith("F")]
    if f_groups:
        return f_groups, True
    # 沒有 F-prefix → 取所有組，事後再用個人頁性別過濾
    return all_groups, False


def parse_athletes_from_page(soup: BeautifulSoup) -> list[dict]:
    """從排行頁的 HTML 抽出選手列表"""
    athletes = []
    for block in soup.select("div.fl-wrap.list-single-main-item_content"):
        name_el = block.select_one(".name")
        bib_el = block.select_one("span.border-right.pr-1")
        type_el = block.select_one("span.border-right.px-1")
        grp_el = block.select_one("span.px-1:not(.border-right)")
        time_el = block.select_one(".time span")
        link_el = block.select_one('a[href*="/athlete/"]')

        if not (name_el and bib_el and time_el):
            continue

        time_str = time_el.get_text(strip=True)
        athlete_url = None
        if link_el:
            href = link_el["href"]
            athlete_url = href if href.startswith("http") else BASE + href

        athletes.append({
            "name": name_el.get_text(strip=True),
            "bib": bib_el.get_text(strip=True),
            "race_type": type_el.get_text(strip=True) if type_el else "",
            "group": grp_el.get_text(strip=True) if grp_el else "",
            "overall_str": time_str,
            "overall_sec": hms_to_seconds(time_str),
            "athlete_url": athlete_url,
        })
    return athletes


PAGE_SIZE = 20  # Bravelog 每頁固定 20 筆，超出時伺服器可能回 500


def fetch_group_all_pages(
    slug_url: str, race_id: int, group: str, max_pages: int = 10
) -> list[dict]:
    """爬一個 group 的所有分頁，自動 dedup。若上一頁不足 PAGE_SIZE 就停（避免 500）。"""
    seen_bibs: set[str] = set()
    all_athletes: list[dict] = []
    for page in range(1, max_pages + 1):
        url = f"{slug_url}?raceId={race_id}&group={group}&page={page}"
        try:
            soup = fetch(url)
        except requests.HTTPError as e:
            print(f"      ⚠ {group} page={page} 失敗 ({e.response.status_code})，停止此組分頁", file=sys.stderr)
            break
        athletes = parse_athletes_from_page(soup)
        new = [a for a in athletes if a["bib"] not in seen_bibs]
        if not new:
            break
        all_athletes.extend(new)
        seen_bibs.update(a["bib"] for a in new)
        if len(athletes) < PAGE_SIZE:
            # 不滿一頁，沒下一頁了
            break
        time.sleep(SLEEP)
    return all_athletes


def fetch_athlete_detail(athlete_url: str) -> dict:
    """從個人成績頁抽出 gender + swim/t1/bike/t2/run 的區段時間"""
    soup = fetch(athlete_url)
    # 性別：在多個 <span class="fs-1"> 裡找內容是「男」或「女」的（class 被多用途共用）
    gender = None
    for s in soup.find_all("span", class_="fs-1"):
        txt = s.get_text(strip=True)
        if txt == "女":
            gender = "F"
            break
        if txt == "男":
            gender = "M"
            break
    # 分段時間
    splits = {"swim": None, "t1": None, "bike": None, "t2": None, "run": None}
    for block in soup.select("div.list-single-main-item.block_box"):
        title_el = block.select_one("h3.cp-title")
        if not title_el:
            continue
        title = title_el.get_text(strip=True).upper()  # 例如 "SWIM 3.8 KM"
        leg = title.split()[0].lower() if title else ""
        if leg not in splits:
            continue
        grades = block.select("p.grade")
        if not grades:
            continue
        # 第一個 .grade = 區段時間
        splits[leg] = grades[0].get_text(strip=True)
    return {"gender": gender, "splits": splits}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("slug", help="Bravelog contest URL slug，例如 2023031801")
    parser.add_argument("--out", default="../raw", help="輸出目錄（預設 ../raw）")
    parser.add_argument("--max-hours", type=float, default=12.0, help="總時間上限（小時，支援小數如 12.5；預設 12.0）")
    parser.add_argument("--dry-run", action="store_true", help="只列出結果不寫檔")
    args = parser.parse_args()

    slug_url = f"{BASE}/contest/rank/{args.slug}"
    max_sec = args.max_hours * 3600

    print(f"\n[1/3] 探測 226K 個人組 raceId @ {slug_url}", file=sys.stderr)
    race_id, race_name, _ = discover_226k_race(slug_url)
    print(f"      → raceId={race_id}", file=sys.stderr)
    print(f"      → name='{race_name}'", file=sys.stderr)
    time.sleep(SLEEP)

    print(f"\n[2/3] 抓取組別清單", file=sys.stderr)
    groups, is_gendered = find_groups(race_id, slug_url)
    label = "F-prefix（已分性別）" if is_gendered else "年齡組（混性別，需事後過濾）"
    print(f"      → {label}", file=sys.stderr)
    print(f"      → {groups}", file=sys.stderr)
    time.sleep(SLEEP)

    print(f"\n[3/3] 各 group 爬取選手並過濾（<{args.max_hours}hr、排除 DNF）", file=sys.stderr)
    candidates: list[dict] = []
    for grp in groups:
        print(f"\n  -- {grp} --", file=sys.stderr)
        athletes = fetch_group_all_pages(slug_url, race_id, grp)
        filtered = [
            a for a in athletes
            if a["overall_sec"] is not None and a["overall_sec"] < max_sec
        ]
        print(f"      {grp}: 總 {len(athletes)} 人, <{args.max_hours}hr 後 {len(filtered)} 人", file=sys.stderr)
        candidates.extend(filtered)

    # 依總時間排序
    candidates.sort(key=lambda a: a["overall_sec"] or 999999)

    if is_gendered:
        print(f"\n[4/4] 抓取每位選手的分段時間（{len(candidates)} 人，已是女子組）", file=sys.stderr)
    else:
        print(f"\n[4/4] 抓取個人頁讀取性別 + 分段（共 {len(candidates)} 人，事後留下女性）", file=sys.stderr)

    all_athletes: list[dict] = []
    for i, a in enumerate(candidates, 1):
        if not a.get("athlete_url"):
            continue
        print(f"  ({i}/{len(candidates)}) {a['name']}", file=sys.stderr)
        try:
            detail = fetch_athlete_detail(a["athlete_url"])
            a["gender"] = detail["gender"]
            a["splits"] = detail["splits"]
        except Exception as e:
            print(f"      ⚠ 失敗: {e}", file=sys.stderr)
            a["gender"] = None
            a["splits"] = {}
        # 若非 F-prefix 賽事，過濾男性
        if not is_gendered and a.get("gender") != "F":
            print(f"      → 男性，跳過", file=sys.stderr)
            time.sleep(SLEEP)
            continue
        all_athletes.append(a)
        time.sleep(SLEEP)

    print(f"\n=== 符合條件選手共 {len(all_athletes)} 人 ===\n", file=sys.stderr)
    for i, a in enumerate(all_athletes, 1):
        s = a.get("splits") or {}
        print(
            f"  {i:2}. {a['name']:<10}  {a['group']:<5}  "
            f"swim={s.get('swim') or '—':<9} "
            f"t1={s.get('t1') or '—':<9} "
            f"bike={s.get('bike') or '—':<9} "
            f"t2={s.get('t2') or '—':<9} "
            f"run={s.get('run') or '—':<9} "
            f"total={a['overall_str']}"
        )

    result = {
        "slug": args.slug,
        "contest_url": slug_url,
        "race_id": race_id,
        "race_name": race_name,
        "max_hours_filter": args.max_hours,
        "athletes": all_athletes,
    }

    if args.dry_run:
        print("\n[dry-run] 不寫檔。", file=sys.stderr)
        return 0

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{args.slug}.json"
    out_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ 寫入 {out_file}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
