#!/usr/bin/env python3
"""
apply.py — 套用 merge 結果到 rankings.csv

執行此腳本會：
1. 讀現有 rankings.csv（保留 BOM）
2. 載入 raw/*.json
3. 對「新台灣選手（中文姓名 + 非縮短版 PR）」加入 CSV
4. 對「既有選手」如有更佳 Bravelog 紀錄，更新 CSV
5. 全部依 overall_sec 重新排序，重編 rank
6. 寫回 rankings.csv（保留 BOM）

⚠ 會直接覆蓋 rankings.csv，記得先 git diff 確認。
"""

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "raw"
CSV_PATH = ROOT / "rankings.csv"

# 跟 merge.py 同步
RACE_CODE_BY_SLUG = {
    "2019110222": "臺東超鐵",
    "2020101730": "普悠瑪",
    "2020111400": "CT",
    "2021041052": "普悠瑪",
    "2021042471": "CT",
    "2022041001": "IM Taiwan",
    "2022042301": "CT",
    "2023031801": "普悠瑪",
    "2023042201": "CT",
    "2024042701": "CT",
    "2025041303": "IM Penghu",
}
SHORTENED_SLUGS = {"2025041303", "2024042701"}


def has_chinese(s: str) -> bool:
    return any("一" <= ch <= "鿿" for ch in s)


def hms_to_sec(s):
    if not s or "--" in s:
        return None
    parts = s.split(":")
    if len(parts) != 3:
        return None
    try:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except ValueError:
        return None


def pad_time(s):
    """時間格式統一為 HH:MM:SS（補前導零）；空值或 DNF 保留原樣"""
    if not s or "--" in s:
        return s
    parts = s.split(":")
    if len(parts) != 3:
        return s
    try:
        return ":".join(p.zfill(2) for p in parts)
    except Exception:
        return s


def main():
    # ──── 讀現有 CSV ─────────────────────────────────────
    raw_bytes = CSV_PATH.read_bytes()
    # 防多重 BOM 累積：剝掉所有開頭的 BOM bytes
    while raw_bytes.startswith(b"\xef\xbb\xbf"):
        raw_bytes = raw_bytes[3:]
    has_bom = True  # 我們最後永遠寫 BOM
    text = raw_bytes.decode("utf-8").lstrip("﻿")
    reader = csv.DictReader(text.splitlines())
    fieldnames = reader.fieldnames
    existing_rows = list(reader)
    existing_by_name = {r["name"]: r for r in existing_rows}
    print(f"[1] 現有 CSV: {len(existing_rows)} 筆，欄位 {len(fieldnames)} 個")

    # ──── 讀 raw ──────────────────────────────────────────
    by_name_normal = defaultdict(list)
    for f in sorted(RAW_DIR.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        slug = d["slug"]
        if slug in SHORTENED_SLUGS:
            continue  # 縮短版不算 PR
        race_code = RACE_CODE_BY_SLUG.get(slug, slug)
        year = int(slug[:4])
        for a in d.get("athletes", []):
            if not has_chinese(a["name"]):  # 跳過英文姓名
                continue
            by_name_normal[a["name"]].append({**a, "race_code": race_code, "year": year, "slug": slug})

    # 每位中文姓名選手取 PR
    new_athletes = {}
    for name, recs in by_name_normal.items():
        pr = min(recs, key=lambda x: x.get("overall_sec") or 9 ** 9)
        new_athletes[name] = pr
    print(f"[2] Bravelog 中文姓名 PR: {len(new_athletes)} 位")

    # ──── 找「新增」與「改善」 ────────────────────────────
    # 改善小於 60 秒不視為有意義（避免不同資料源測量差導致誤覆蓋既有 CSV）
    MIN_IMPROVEMENT_SEC = 60
    to_add = []
    to_update = []
    to_update_trivial = []  # 改善 < 60 秒，記錄但不採用
    for name, pr in new_athletes.items():
        if name in existing_by_name:
            csv_sec = hms_to_sec(existing_by_name[name].get("overall", ""))
            if csv_sec is None:
                continue
            delta = csv_sec - pr["overall_sec"]
            if delta >= MIN_IMPROVEMENT_SEC:
                to_update.append((name, pr))
            elif delta > 0:
                to_update_trivial.append((name, pr, delta))
        else:
            to_add.append((name, pr))

    print(f"[3] 新增 {len(to_add)} 位，更新 {len(to_update)} 位")
    if to_add:
        print(f"    新增: {', '.join(n for n,_ in to_add)}")
    if to_update:
        print(f"    更新: {', '.join(n for n,_ in to_update)}")
    if to_update_trivial:
        print(f"    略過微改善 (< {MIN_IMPROVEMENT_SEC}s)：")
        for n, _, d in to_update_trivial:
            print(f"      - {n}: 差 {d} 秒，不採用 Bravelog 數據")

    # ──── 構造新列 ────────────────────────────────────────
    def make_row(name, pr):
        s = pr.get("splits") or {}
        return {
            "rank": "",  # 等下重編
            "name": name,
            "country": "TWN",
            "race": pr["race_code"],
            "year": str(pr["year"]),
            "swim": s.get("swim") or "",
            "t1": s.get("t1") or "",
            "bike": s.get("bike") or "",
            "t2": s.get("t2") or "",
            "run": s.get("run") or "",
            "overall": pr["overall_str"],
            "overall_pos": "",
            "notes": "",
            "bio": "",
            "source": pr.get("athlete_url") or "",
            "source_label": "Bravelog",
            "photo": "",
        }

    # 更新既有
    for name, pr in to_update:
        new_row = make_row(name, pr)
        # 保留原本的 bio / notes / photo
        old = existing_by_name[name]
        for keep in ("notes", "bio", "photo"):
            if old.get(keep):
                new_row[keep] = old[keep]
        existing_by_name[name] = new_row

    # 加入新選手
    for name, pr in to_add:
        existing_by_name[name] = make_row(name, pr)

    # ──── 統一時間格式（補前導零） ────────────────────────
    TIME_COLS = ["swim", "t1", "bike", "t2", "run", "overall"]
    for r in existing_by_name.values():
        for col in TIME_COLS:
            r[col] = pad_time(r.get(col, ""))

    # ──── 排序 + 重編 rank ────────────────────────────────
    merged = list(existing_by_name.values())
    merged.sort(key=lambda r: hms_to_sec(r["overall"]) or 9 ** 9)
    for i, r in enumerate(merged, 1):
        r["rank"] = str(i)

    print(f"[4] 合併後共 {len(merged)} 筆")

    # ──── 寫回 CSV（永遠保留 BOM）─────────────────────────
    buf = []
    buf.append(",".join(fieldnames))
    for r in merged:
        cells = [str(r.get(fn, "")) for fn in fieldnames]
        def esc(s):
            if "," in s or '"' in s:
                return '"' + s.replace('"', '""') + '"'
            return s
        buf.append(",".join(esc(c) for c in cells))
    output = "\n".join(buf) + "\n"

    out_bytes = b"\xef\xbb\xbf" + output.encode("utf-8")  # 統一強制加 BOM（Excel 友善）
    CSV_PATH.write_bytes(out_bytes)
    print(f"[5] ✓ 寫入 {CSV_PATH}（BOM 已加，時間統一補前導零）")


if __name__ == "__main__":
    main()
