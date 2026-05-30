#!/usr/bin/env python3
"""
ironman.py — 從 IRONMAN 官方 race-results 頁抓「最新一年」該分站之台灣女子完賽資料。

流程：
  ironman.com/im-<slug>-results
    → 抓 iframe URL（labs-v2.competitor.com/results/event/<uuid>）
    → 抓那頁的 __NEXT_DATA__ JSON
    → 過濾：iso3 = "TWN" + gender = "Female" + total < max-hours
    → 輸出 raw/im-<slug>-<year>.json

用法：
  python3 ironman.py im-frankfurt                                 # 單場
  python3 ironman.py im-cairns im-western-australia im-malaysia   # 多場
  python3 ironman.py im-taiwan --max-hours 12.5                   # 自訂 cutoff
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "raw"
SLEEP = 2.0  # IRONMAN 比 Bravelog 嚴格，間隔稍長

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,zh-TW;q=0.8",
}


def fetch(url: str, retries: int = 3) -> str:
    print(f"  GET {url}", file=sys.stderr)
    last_exc = None
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=60)
            r.raise_for_status()
            return r.text
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError) as e:
            last_exc = e
            wait = 2 ** attempt
            print(f"      ⚠ 第 {attempt} 次失敗（{type(e).__name__}），{wait}s 後重試", file=sys.stderr)
            time.sleep(wait)
    raise last_exc if last_exc else RuntimeError("fetch failed")


def find_iframe_url(html: str) -> str:
    """ironman.com race-results 頁裡找 labs-v2.competitor.com iframe URL"""
    m = re.search(r'<iframe[^>]+src="(https://labs-v2\.competitor\.com/results/event/[^"/]+)"', html)
    if not m:
        raise RuntimeError("找不到 labs-v2.competitor.com 結果 iframe URL")
    return m.group(1)


def parse_next_data(html: str) -> dict:
    """labs-v2.competitor.com 頁內找 __NEXT_DATA__ JSON"""
    m = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.+?)</script>', html, re.DOTALL)
    if not m:
        raise RuntimeError("找不到 __NEXT_DATA__")
    return json.loads(m.group(1))


def hms_to_sec(s):
    if not s or s == "0:00:00" or s == "00:00:00":
        return None
    parts = s.split(":")
    if len(parts) != 3:
        return None
    try:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except ValueError:
        return None


def normalize_time(s):
    """0:45:15 → 00:45:15；空值或無效保留原樣"""
    if not s:
        return ""
    if s in ("0:00:00", "00:00:00", "-:--:--", "--:--:--"):
        return ""
    parts = s.split(":")
    if len(parts) != 3:
        return s
    try:
        return ":".join(p.zfill(2) for p in parts)
    except Exception:
        return s


def extract_athletes(next_data: dict) -> tuple[list[dict], str, int]:
    """從 __NEXT_DATA__ 取出 athletes list + event 名稱 + 年份"""
    page_props = next_data.get("props", {}).get("pageProps", {})

    # event 標籤
    event_name = ""
    event_year = 0
    subevents = page_props.get("subevents") or []
    for sub in subevents:
        name = sub.get("wtc_name") or ""
        if name:
            event_name = name
            # 從名字找年份
            m = re.search(r'\b(20\d{2})\b', name)
            if m:
                event_year = int(m.group(1))
            break

    # athletes 在 latestResults（labs-v2.competitor.com 的 Next.js 慣例）
    athletes = (
        page_props.get("latestResults")
        or page_props.get("results")
        or page_props.get("data")
        or page_props.get("athletes")
        or []
    )
    # 有時 athletes 不在頂層，遞迴找最大的 list of dicts that has wtc_iso3 in each
    if not athletes:
        def walk(obj):
            if isinstance(obj, list) and obj and isinstance(obj[0], dict):
                if any("wtc_iso3" in str(x) or "wtc_CountryRepresentingId" in str(x) for x in obj[:3]):
                    return obj
            if isinstance(obj, dict):
                for v in obj.values():
                    r = walk(v)
                    if r:
                        return r
            if isinstance(obj, list):
                for v in obj:
                    r = walk(v)
                    if r:
                        return r
            return None
        athletes = walk(next_data) or []

    return athletes, event_name, event_year


def filter_twn_female(athletes: list[dict], max_hours: float) -> list[dict]:
    """過濾出 iso3=TWN + Female + total < max_hours

    資料結構：
      a.wtc_CountryRepresentingId.wtc_iso3 = "TWN"
      a.wtc_ContactId.gendercode_formatted = "Female"
      a.wtc_ContactId.fullname / firstname / lastname
      a.wtc_finishtimeformatted = "10:22:39"
      a.wtc_swimtimeformatted / wtc_biketimeformatted / wtc_runtimeformatted
      a.wtc_transition1timeformatted / wtc_transition2timeformatted
      a.wtc_AgeGroupId.wtc_name
    """
    max_sec = int(max_hours * 3600)
    out = []
    for a in athletes:
        country = a.get("wtc_CountryRepresentingId") or {}
        if not isinstance(country, dict):
            continue
        iso3 = country.get("wtc_iso3")
        if iso3 != "TWN":
            continue

        contact = a.get("wtc_ContactId") or {}
        if not isinstance(contact, dict):
            continue
        gender = contact.get("gendercode_formatted", "")
        if "female" not in gender.lower():
            continue

        total_str = a.get("wtc_finishtimeformatted") or ""
        sec = hms_to_sec(total_str)
        if sec is None or sec >= max_sec:
            continue

        agegroup_obj = a.get("wtc_AgeGroupId") or {}
        agegroup = agegroup_obj.get("wtc_name", "") if isinstance(agegroup_obj, dict) else ""

        out.append({
            "name": contact.get("fullname") or f"{contact.get('firstname','')} {contact.get('lastname','')}".strip(),
            "firstname": contact.get("firstname") or "",
            "lastname": contact.get("lastname") or "",
            "country_iso3": iso3,
            "city": contact.get("address1_city") or "",
            "gender": "F",
            "agegroup": agegroup,
            "bib": a.get("wtc_trackerid") or "",
            "overall_str": normalize_time(total_str),
            "overall_sec": sec,
            "finish_rank_overall": a.get("wtc_finishrankoverall"),
            "finish_rank_gender": a.get("wtc_finishrankgender"),
            "finish_rank_group": a.get("wtc_finishrankgroup"),
            "splits": {
                "swim": normalize_time(a.get("wtc_swimtimeformatted") or ""),
                "t1": normalize_time(a.get("wtc_transition1timeformatted") or ""),
                "bike": normalize_time(a.get("wtc_biketimeformatted") or ""),
                "t2": normalize_time(a.get("wtc_transition2timeformatted") or ""),
                "run": normalize_time(a.get("wtc_runtimeformatted") or ""),
            },
        })
    out.sort(key=lambda x: x["overall_sec"])
    return out


def scrape_one(slug: str, max_hours: float, dry_run: bool = False) -> dict:
    print(f"\n========== {slug} ==========", file=sys.stderr)
    race_url = f"https://www.ironman.com/{slug}-results"
    html = fetch(race_url)
    time.sleep(SLEEP)
    iframe_url = find_iframe_url(html)
    print(f"  iframe → {iframe_url}", file=sys.stderr)
    iframe_html = fetch(iframe_url)

    nd = parse_next_data(iframe_html)
    athletes, event_name, event_year = extract_athletes(nd)
    print(f"  event: {event_name} (year={event_year}), 完賽總數: {len(athletes)}", file=sys.stderr)

    twn_female = filter_twn_female(athletes, max_hours)
    print(f"  TWN 女子 < {max_hours}hr: {len(twn_female)} 人", file=sys.stderr)
    for a in twn_female:
        s = a["splits"]
        print(f"    - {a['name']:<25} {a['overall_str']}  swim={s['swim']} bike={s['bike']} run={s['run']}", file=sys.stderr)

    result = {
        "source": "ironman.com",
        "slug": slug,
        "race_url": race_url,
        "iframe_url": iframe_url,
        "event_name": event_name,
        "event_year": event_year,
        "max_hours_filter": max_hours,
        "athletes": twn_female,
    }
    if dry_run:
        return result

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out_file = RAW_DIR / f"{slug}-{event_year or 'unknown'}.json"
    out_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  ✓ 寫入 {out_file}", file=sys.stderr)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("slugs", nargs="+", help="IRONMAN race slug，例如 im-frankfurt im-cairns")
    parser.add_argument("--max-hours", type=float, default=12.5)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    total = 0
    for slug in args.slugs:
        try:
            r = scrape_one(slug, args.max_hours, args.dry_run)
            total += len(r["athletes"])
        except Exception as e:
            print(f"  ✗ {slug} 失敗: {e}", file=sys.stderr)
        time.sleep(SLEEP)

    print(f"\n=== 全部完成，共抓到 {total} 位 TWN 女子（含可能跨場重複）===", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
