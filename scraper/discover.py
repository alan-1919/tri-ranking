#!/usr/bin/env python3
"""
Bravelog 賽事掃描器 — 從 /search API 列出指定年份範圍內所有「鐵人三項」賽事，
並用關鍵字篩出疑似 226K 全程賽事。

用法：
    python3 discover.py                          # 預設 2017–2026
    python3 discover.py --start 2020 --end 2024
    python3 discover.py --out candidates.tsv     # 寫到指定檔案

輸出 TSV：uid, date, title, matched_keywords
"""

import argparse
import sys
import time
from pathlib import Path

import requests

BASE = "https://www.bravelog.tw"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 "
        "(tri-ranking-scraper; contact: kobby0923-tw.github.io/tri-ranking)"
    ),
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json",
}
SLEEP = 1.0  # 禮貌間隔

# 鐵人三項 race-type
RACE_TYPE_TRI = "54"

# 命中關鍵字（任一即視為候選；不分大小寫）
KEYWORDS = [
    "226",
    "普悠瑪",
    "puyuma",
    "challenge taiwan",   # 比單 "challenge" 嚴格，避免 Open Water Challenge 之類誤判
    "ironman taiwan",
    "ironman 台灣",
    "ironman 澎湖",
    "超鐵",
    "超級鐵人",
]

# 排除字（即使有命中，含這些字也不要——通常是短距離 / 非全程鐵）
EXCLUDE = [
    "51.5",
    "25.75",
    "70.3",       # IM 70.3 是半距，不是 226
    "小鐵人",
    "小小鐵人",
    "兩項",
    "二鐵",
    "越野",       # XTERRA 越野不算
    "泛舟",
    "泳渡",
    "兩棲",
    "open water",
    "lava tri",   # LAVA TRI 通常是 Olympic 距離，非 226
]


def search_year(year: int) -> list[dict]:
    """呼叫 /search API 取某一年的鐵人三項賽事清單"""
    params = [
        ("start", f"{year}/01/01"),
        ("end", f"{year}/12/31"),
        ("race-type[]", RACE_TYPE_TRI),
        ("orderBy", "start_date|asc"),
    ]
    r = requests.get(f"{BASE}/search", params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data.get("contests") or []


def matched_keywords(title: str) -> list[str]:
    """回傳命中的關鍵字列表（空 list 表示沒命中）"""
    low = title.lower()
    return [kw for kw in KEYWORDS if kw.lower() in low]


def has_exclude(title: str) -> bool:
    return any(x.lower() in title.lower() for x in EXCLUDE)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", type=int, default=2017, help="起始年份（預設 2017）")
    parser.add_argument("--end", type=int, default=2026, help="結束年份（預設 2026）")
    parser.add_argument("--out", default="candidates.tsv", help="輸出 TSV 路徑（預設 candidates.tsv）")
    parser.add_argument("--include-rejected", action="store_true", help="把被排除字過濾掉的也列出（debug 用）")
    args = parser.parse_args()

    candidates: list[tuple] = []
    rejected: list[tuple] = []

    for year in range(args.start, args.end + 1):
        print(f"\n[{year}] 查詢中...", file=sys.stderr)
        try:
            contests = search_year(year)
        except Exception as e:
            print(f"  ⚠ 失敗：{e}", file=sys.stderr)
            continue
        print(f"  共 {len(contests)} 場鐵人三項", file=sys.stderr)
        for c in contests:
            title = c.get("title", "")
            uid = c.get("uid", "")
            date = (c.get("start_date") or "")[:10]
            hits = matched_keywords(title)
            excluded = has_exclude(title)
            if hits and not excluded:
                candidates.append((uid, date, title, ",".join(hits)))
                print(f"  ✓ {uid}  {date}  {title}", file=sys.stderr)
            elif hits and excluded:
                rejected.append((uid, date, title, "excluded: " + ",".join(hits)))
                if args.include_rejected:
                    print(f"  ✗ {uid}  {date}  {title}  (排除)", file=sys.stderr)
        time.sleep(SLEEP)

    out_path = Path(args.out)
    with out_path.open("w", encoding="utf-8") as f:
        f.write("uid\tdate\ttitle\tmatched\n")
        for row in candidates:
            f.write("\t".join(row) + "\n")
        if args.include_rejected:
            f.write("# --- rejected (含排除字) ---\n")
            for row in rejected:
                f.write("\t".join(row) + "\n")

    print(f"\n=== 候選 {len(candidates)} 場（已被排除 {len(rejected)} 場） ===", file=sys.stderr)
    print(f"  寫入 → {out_path}", file=sys.stderr)
    print(f"\n之後手動檢視 {out_path}，把確定要爬的 uid 一行行餵給 bravelog.py。", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
