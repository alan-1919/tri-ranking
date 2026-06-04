#!/usr/bin/env python3
"""
sportsplits.py — 從 sportsplits.com 抓單場賽事的成績（方案 2：人工存 HTML）

為什麼用「人工存 HTML」而不直接 fetch：
    sportsplits 的 /events/* 深頁被 Cloudflare WAF 主動 challenge，
    連 Playwright + 系統真實 Chrome 都被擋。但你用「平常的瀏覽器」打開
    那個 URL，Cloudflare 對人類 session 就放行——所以我們用人工搭配：
        1. 你在 Chrome 開 URL，網頁完整載入後
        2. Cmd+S 把整頁存成 .html 檔
        3. 跑這個腳本解析該檔，輸出 raw/sp-*.json

用法：
    # 標準情境：gender 已被 sportsplits 預先過濾（深頁或主頁分區）
    python3 sportsplits.py path/to/saved.html
    python3 sportsplits.py path/to/saved.html --gender Female --event 1
    python3 sportsplits.py path/to/saved.html --slug challenge-taiwan-day2-2026
    python3 sportsplits.py path/to/saved.html --dry-run

    # 混合男女的 event 頁面（Cloudflare 擋深頁時的備援）：
    #   方法 1 — 按 category prefix 過濾（regex prefix 比對）
    python3 sportsplits.py path/to/saved.html --filter-categories "F.*"
    #   方法 2 — 給定明確 bib 白名單
    python3 sportsplits.py path/to/saved.html --filter-bibs 702,755,688

輸出：raw/sp-{slug}-e{event}.json
"""

import argparse
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "raw"


# ───── 時間 helpers ────────────────────────────────────────────────
def hms_to_sec(s):
    if not s or "--" in str(s):
        return None
    parts = str(s).split(":")
    if len(parts) != 3:
        return None
    try:
        h, m, sec = (int(p) for p in parts)
        return h * 3600 + m * 60 + sec
    except ValueError:
        return None


def sec_to_hms(sec):
    if sec is None or sec < 0:
        return ""
    h = sec // 3600
    m = (sec % 3600) // 60
    s = sec % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


# ───── HTML 解析 ──────────────────────────────────────────────────
def detect_slug(soup):
    """從 HTML 自動偵測 race slug（從 canonical / og:url / 任意 /races/X 連結）。"""
    # 1. canonical
    canon = soup.find("link", rel="canonical")
    if canon and canon.get("href"):
        m = re.search(r"/races/([^/?#]+)", canon["href"])
        if m:
            return m.group(1)
    # 2. og:url
    og = soup.find("meta", property="og:url")
    if og and og.get("content"):
        m = re.search(r"/races/([^/?#]+)", og["content"])
        if m:
            return m.group(1)
    # 3. 任何 /races/X 連結
    for a in soup.find_all("a", href=True):
        m = re.search(r"/races/([^/?#]+)", a["href"])
        if m:
            return m.group(1)
    return None


def gender_label_of_table(table):
    """取出 table 對應的「Female / Male / Mixed」標籤。

    兩種網頁版型：
      A) CT 風格：標籤放在 thead 第一個 <tr> 內
      B) Puyuma 風格：標籤在 table 上方的 <a> / <div> 文字內
    """
    LABELS = ("Female", "Male", "Mixed")
    # A) thead 第一個 tr
    thead = table.find("thead")
    if thead:
        first_tr = thead.find("tr")
        if first_tr:
            txt = first_tr.get_text(" ", strip=True)
            for label in LABELS:
                if label in txt:
                    return label
    # B) 往前找最近的「純 Female/Male/Mixed」元素
    for prev in table.find_all_previous(
        ["a", "div", "h1", "h2", "h3", "h4", "h5", "span", "p"],
        limit=30,
    ):
        txt = prev.get_text(" ", strip=True)
        if txt in LABELS:
            return txt
    return None


def event_label_of_table(table):
    """看 table 上方最近的「event 連結文字」，例如 'CT 226k Individual'。"""
    # 往上找最近的 <a href="/races/.../events/N/"> 連結（不含 results / gender 子路徑）
    prev = table.find_previous("a", href=re.compile(r"/races/[^/]+/events/\d+/?$"))
    if prev:
        return prev.get_text(" ", strip=True)
    return None


def event_id_of_table(table):
    """從 table 上方的 event 連結擷取 event_id 整數。"""
    prev = table.find_previous("a", href=re.compile(r"/races/[^/]+/events/\d+"))
    if prev:
        m = re.search(r"/events/(\d+)", prev["href"])
        if m:
            return int(m.group(1))
    return None


def parse_results_table(table):
    """解析一個 sportsplits 的 <table class="u-table--v1"> → list of athlete dicts

    HTML 結構：
        <thead>
          <tr>... Female / Male / Mixed 標題列 ...</tr>
          <tr>
            <th>Pos</th><th>Category</th><th>Name</th>
            <th>Gun Time</th> [<th>Representing</th>] [<th>Swim</th>]
            <th>T1</th><th>Cycle</th><th>T2</th><th>Run</th>
          </tr>
        </thead>
        <tbody><tr>...每位選手一列...</tr></tbody>

    動態 column mapping：欄位順序 / 有無可能因賽事不同
    若列表沒給 Swim → A 法推算 (gun − t1 − bike − t2 − run)
    """
    thead = table.find("thead")
    if not thead:
        return []
    trs = thead.find_all("tr")
    if not trs:
        return []
    th_row = trs[-1]
    cols = [th.get_text(strip=True).lower() for th in th_row.find_all("th")]
    col_idx = {name: i for i, name in enumerate(cols)}

    def cell(row_tds, *aliases):
        # 先試完全比對；找不到再試 partial（例：header 是 "Category (Pos)" 也能被 alias "category" 命中）
        for a in aliases:
            i = col_idx.get(a.lower())
            if i is not None and i < len(row_tds):
                return row_tds[i].get_text(" ", strip=True)
        for a in aliases:
            for col_name, idx in col_idx.items():
                if a.lower() in col_name and idx < len(row_tds):
                    return row_tds[idx].get_text(" ", strip=True)
        return ""

    tbody = table.find("tbody")
    if not tbody:
        return []

    athletes = []
    for tr in tbody.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 4:
            continue

        name_i = col_idx.get("name")
        if name_i is None or name_i >= len(tds):
            continue
        name_cell = tds[name_i]
        a = name_cell.find("a")
        name_full = (a.get_text(" ", strip=True) if a else name_cell.get_text(" ", strip=True)).strip()
        athlete_url = a.get("href", "") if a else ""
        m = re.match(r"(.+?)\s*\(#(\d+)\)\s*$", name_full)
        if m:
            name = m.group(1).strip()
            bib = m.group(2)
        else:
            name = name_full
            bib = ""

        gun = cell(tds, "gun time", "time", "chip time")
        gun_sec = hms_to_sec(gun)
        if gun_sec is None:
            continue

        swim = cell(tds, "swim")
        t1 = cell(tds, "t1")
        bike = cell(tds, "cycle", "bike")
        t2 = cell(tds, "t2")
        run = cell(tds, "run")

        # A 法：列表頁沒給 swim 就推算
        if not swim:
            sec = gun_sec
            ok = True
            for leg in (t1, bike, t2, run):
                ssec = hms_to_sec(leg)
                if ssec is None:
                    ok = False
                    break
                sec -= ssec
            if ok and sec > 0:
                swim = sec_to_hms(sec)

        # Category 欄位可能長成 "35-39 (1)" → 剝掉尾端 "(N)"，留下純年齡組
        group_raw = cell(tds, "category")
        group = re.sub(r"\s*\(\d+\)\s*$", "", group_raw).strip()

        athletes.append({
            "name": name,
            "bib": bib,
            "group": group,
            "club": cell(tds, "club", "representing"),
            "overall_str": gun,
            "overall_sec": gun_sec,
            "athlete_url": ("https://www.sportsplits.com" + athlete_url) if athlete_url.startswith("/") else athlete_url,
            "splits": {
                "swim": swim,
                "t1": t1,
                "bike": bike,
                "t2": t2,
                "run": run,
            },
        })

    return athletes


def pick_table(soup, want_gender, want_event_id, verbose=True):
    """從 HTML 內所有 u-table--v1 挑出符合 (gender, event_id) 的 table。

    HTML 兩種情境：
        - 你存「深頁」(/events/{eid}/gender/Female) → 通常只有 1 個 table 就是目標
        - 你存「主頁」(/races/{slug}) → 10 個 table，要靠 gender + event_id 篩
    """
    tables = soup.select("table.u-table--v1")
    if not tables:
        return None, []

    candidates = []
    for t in tables:
        g = gender_label_of_table(t)
        eid = event_id_of_table(t)
        elabel = event_label_of_table(t)
        candidates.append({"table": t, "gender": g, "event_id": eid, "event_label": elabel})

    if verbose:
        print(f"[info] HTML 內找到 {len(candidates)} 個 u-table--v1：", file=sys.stderr)
        for i, c in enumerate(candidates):
            print(f"  [{i}] gender={c['gender']!s:<7} event_id={c['event_id']!s:<5} label={c['event_label']!r}",
                  file=sys.stderr)

    # 完全匹配優先
    for c in candidates:
        if c["gender"] == want_gender and c["event_id"] == want_event_id:
            return c["table"], candidates

    # 只有 1 個就直接用
    if len(candidates) == 1:
        if verbose:
            print(f"[info] 只有 1 個 table，直接使用（忽略 gender/event 不符）", file=sys.stderr)
        return candidates[0]["table"], candidates

    # 退而求其次：gender 對就好
    for c in candidates:
        if c["gender"] == want_gender:
            if verbose:
                print(f"[warn] 沒找到 event_id={want_event_id} 的 {want_gender}；用 event_id={c['event_id']} 代替",
                      file=sys.stderr)
            return c["table"], candidates

    return None, candidates


# ───── main ─────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("html_file", help="從瀏覽器 Cmd+S 存下來的 HTML 檔路徑")
    parser.add_argument("--slug", help="race slug（不給就從 HTML 自動偵測）")
    parser.add_argument("--event", type=int, default=1, help="event id（多日 / 多距離賽事，預設 1 = 主賽）")
    parser.add_argument("--gender", default="Female", choices=["Female", "Male"])
    parser.add_argument("--max-hours", type=int, default=15, help="總時間上限（小時），預設 15")
    parser.add_argument(
        "--filter-categories",
        default="",
        help="逗號分隔的 category regex prefix；只保留 match 的列。例：'F.*' 或 'Overall,F40,F45'。空 = 不過濾",
    )
    parser.add_argument(
        "--filter-bibs",
        default="",
        help="逗號分隔的 bib 號碼白名單；只保留這些 bib。例：'702,755,688'。空 = 不過濾",
    )
    parser.add_argument("--out", default=str(RAW_DIR), help="輸出目錄，預設 ../raw")
    parser.add_argument("--dry-run", action="store_true", help="只解析、不寫檔")
    args = parser.parse_args()

    html_path = Path(args.html_file)
    if not html_path.exists():
        sys.exit(f"❌ 找不到檔案：{html_path}")

    html = html_path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")

    slug = args.slug or detect_slug(soup)
    if not slug:
        sys.exit("❌ 無法從 HTML 偵測 slug，請用 --slug 指定")
    print(f"[info] slug = {slug}", file=sys.stderr)

    table, candidates = pick_table(soup, args.gender, args.event, verbose=True)
    if table is None:
        sys.exit(f"❌ 找不到符合 gender={args.gender} 的 table；HTML 可能不是 sportsplits 結果頁，或頁面結構已變")

    athletes = parse_results_table(table)
    raw_count = len(athletes)

    # filter: category prefix
    if args.filter_categories:
        patterns = [
            re.compile(p.strip())
            for p in args.filter_categories.split(",")
            if p.strip()
        ]
        before = len(athletes)
        athletes = [a for a in athletes if any(p.match(a["group"] or "") for p in patterns)]
        print(f"[filter] category {patterns!r}: {before} → {len(athletes)} 筆", file=sys.stderr)

    # filter: bib whitelist
    if args.filter_bibs:
        allowed = {b.strip() for b in args.filter_bibs.split(",") if b.strip()}
        before = len(athletes)
        athletes = [a for a in athletes if a["bib"] in allowed]
        print(f"[filter] bib {sorted(allowed)}: {before} → {len(athletes)} 筆", file=sys.stderr)

    max_sec = args.max_hours * 3600
    athletes = [a for a in athletes if a["overall_sec"] and a["overall_sec"] < max_sec]
    athletes.sort(key=lambda a: a["overall_sec"])

    # race name from <title>
    title_tag = soup.find("title")
    race_name = (title_tag.get_text(strip=True) if title_tag else slug)
    race_name = race_name.replace(" | SportSplits", "").replace(" Results", "").strip()

    out = {
        "slug": slug,
        "source": "sportsplits",
        "event_id": args.event,
        "gender": args.gender,
        "contest_url": f"https://www.sportsplits.com/races/{slug}/events/{args.event}/gender/{args.gender}",
        "race_name": race_name,
        "max_hours_filter": args.max_hours,
        "athletes": athletes,
    }

    used_filter = bool(args.filter_categories or args.filter_bibs)
    label = "完賽（filter 後）" if used_filter else f"{args.gender} 完賽"
    print(f"\n✓ 抓到 {len(athletes)} 位 {label}（≤{args.max_hours} 小時）\n", file=sys.stderr)
    for a in athletes:
        print(f"  {a['overall_str']}  {a['name']:<10}  #{a['bib']:<5}  [{a['group']}]", file=sys.stderr)

    if args.dry_run:
        print("\n(--dry-run, 沒寫檔)", file=sys.stderr)
        return

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"sp-{slug}-e{args.event}.json"
    out_file.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ 寫入 {out_file}", file=sys.stderr)


if __name__ == "__main__":
    main()
