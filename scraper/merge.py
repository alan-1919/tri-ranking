#!/usr/bin/env python3
"""
merge.py — 把 raw/*.json 合併成「候選審查報告」

特性：
- **不會動 rankings.csv**，純輸出 markdown 給你審
- 縮短版賽事（如 2025 IM 澎湖 swim 1.9km、2024 CT 異常）→ 不計入 PR，但仍記錄
- 國籍判斷：含中文字 → 台灣；純英文 → 嘗試對 ATHLETES_EN 反查，找不到放「待確認」
- 個人最佳：每個選手取「正常賽事」的最佳成績

輸出：scraper/candidates_review.md
"""

import csv
import glob
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "raw"
CSV_PATH = ROOT / "rankings.csv"
DATA_JS = ROOT / "data.js"
OUT_PATH = ROOT / "scraper" / "candidates_review.md"

# Bravelog slug → 內部 race code（對應 rankings.csv 的 race 欄）
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

# 縮短 swim 距離 / 資料異常 → 不計入 PR
SHORTENED_SLUGS = {
    "2025041303",  # IM 澎湖：swim 1.9km
    "2024042701",  # CT 2024：T1 異常、swim 異常
}


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


def fmt_sec(sec):
    if sec is None:
        return "—"
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def load_athletes_en_reverse():
    """解析 data.js 的 ATHLETES_EN 對照表，建立「英文姓名（多種寫法）→ 中文名」反向 map"""
    rev = {}
    txt = DATA_JS.read_text(encoding="utf-8")
    block = re.search(r"const ATHLETES_EN\s*=\s*\{(.+?)\};", txt, re.DOTALL)
    if not block:
        return rev
    for m in re.finditer(r'"([^"]+)"\s*:\s*"([^"]+)"', block.group(1)):
        zh, en = m.group(1), m.group(2)
        # 原本格式（"Li-Yun Chen"）
        rev[en.lower()] = zh
        parts = en.split()
        if len(parts) >= 2:
            surname = parts[-1]
            firstname = " ".join(parts[:-1])
            # Bravelog 常見格式 "CHEN Liyun"（姓 + 不含 hyphen 的名）
            rev[f"{surname.upper()} {firstname.replace('-', '')}".lower()] = zh
            # 變體 "CHEN Li Yun"（hyphen 改空白）
            rev[f"{surname.upper()} {firstname.replace('-', ' ')}".lower()] = zh
            # 變體 "CHEN Li-Yun"
            rev[f"{surname.upper()} {firstname}".lower()] = zh
    return rev


def load_current_csv():
    """讀現有 rankings.csv → name -> dict(overall_sec, race, year)"""
    rows = {}
    if not CSV_PATH.exists():
        return rows
    with CSV_PATH.open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            sec = hms_to_sec(row.get("overall", ""))
            if sec and row.get("name"):
                rows[row["name"]] = {
                    "overall_sec": sec,
                    "race": row.get("race", ""),
                    "year": row.get("year", ""),
                }
    return rows


def load_raw_athletes(reverse_en):
    """讀所有 raw/*.json，回傳 athlete 紀錄列表，含 normalized_name"""
    records = []
    for f in sorted(RAW_DIR.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        slug = d["slug"]
        race_code = RACE_CODE_BY_SLUG.get(slug, slug)
        year = int(slug[:4])
        shortened = slug in SHORTENED_SLUGS
        for a in d.get("athletes", []):
            name = a["name"]
            # 標準化：中文姓名保留；英文若能對到 ATHLETES_EN 反查就改中文
            if has_chinese(name):
                normalized = name
                is_intl_lookup = None
            else:
                zh = reverse_en.get(name.lower())
                normalized = zh if zh else name
                is_intl_lookup = zh  # 如果有對到，記下
            records.append({
                **a,
                "slug": slug,
                "race_code": race_code,
                "year": year,
                "shortened": shortened,
                "normalized_name": normalized,
                "matched_zh": is_intl_lookup,
            })
    return records


def main():
    rev_en = load_athletes_en_reverse()
    current_csv = load_current_csv()
    raw = load_raw_athletes(rev_en)

    # 按 normalized_name 分組，分「正常」與「縮短」兩桶
    by_name_normal = defaultdict(list)
    by_name_shortened = defaultdict(list)
    for r in raw:
        bucket = by_name_shortened if r["shortened"] else by_name_normal
        bucket[r["normalized_name"]].append(r)

    # 分類
    SEC_NEW_TWN = []        # 新台灣選手（中文姓名，不在 CSV）
    SEC_IMPROVE = []        # CSV 已有，新成績更好
    SEC_NO_CHANGE = []      # CSV 已有，新成績沒更好
    SEC_MAYBE_TWN = []      # 英文姓名但對到 ATHLETES_EN，可能是台灣
    SEC_UNKNOWN = []        # 純英文姓名，國籍未知
    SEC_SHORTENED_ONLY = [] # 只有縮短版紀錄

    all_names = set(by_name_normal) | set(by_name_shortened)
    for name in all_names:
        normal = by_name_normal.get(name, [])
        shortened = by_name_shortened.get(name, [])

        # 找 PR：只看 normal 賽事；若無，標記 shortened-only
        if not normal:
            pr_s = min(shortened, key=lambda x: x.get("overall_sec") or 9 ** 9)
            SEC_SHORTENED_ONLY.append({"name": name, "pr": pr_s, "shortened_records": shortened})
            continue
        pr = min(normal, key=lambda x: x.get("overall_sec") or 9 ** 9)

        # 判斷分組
        item = {
            "name": name,
            "pr": pr,
            "all_normal": sorted(normal, key=lambda x: x.get("overall_sec") or 9 ** 9),
            "shortened_records": shortened,
        }

        if name in current_csv:
            csv_sec = current_csv[name]["overall_sec"]
            if pr["overall_sec"] < csv_sec:
                item["csv"] = current_csv[name]
                SEC_IMPROVE.append(item)
            else:
                item["csv"] = current_csv[name]
                SEC_NO_CHANGE.append(item)
        elif has_chinese(name):
            SEC_NEW_TWN.append(item)
        else:
            # 名字是英文：看是否原本就是經反查得來的中文
            # 由於 normalized_name 中文時上面已 catch，這裡 normalized 還是英文
            # 表示 ATHLETES_EN 反查沒命中
            # 但有可能 raw 中該人有「不同寫法」其中一寫法被反查到了
            # 為簡化，這裡直接歸 unknown
            SEC_UNKNOWN.append(item)

    # MAYBE_TWN：是有些選手在 raw 裡有多筆紀錄，其中部分被反查命中、部分沒命中
    # 標準化後其實已合併。但如果同名英文姓在反查 map 中存在 mapping，
    # 表示這是「英文姓名但可被識別為台灣」
    # （簡化：透過判斷 matched_zh 欄位）
    final_maybe = []
    final_unknown = []
    for item in SEC_UNKNOWN:
        # 在 PR record 看 matched_zh
        if item["pr"].get("matched_zh"):
            item["matched_zh"] = item["pr"]["matched_zh"]
            final_maybe.append(item)
        else:
            final_unknown.append(item)
    SEC_MAYBE_TWN = final_maybe
    SEC_UNKNOWN = final_unknown

    # ────────────────────────────────────────────────
    # 生成 markdown 報告
    # ────────────────────────────────────────────────
    lines = []
    lines.append("# 候選審查報告 · Bravelog 爬蟲合併結果")
    lines.append("")
    lines.append(f"- 來源 raw 檔案：{len(list(RAW_DIR.glob('*.json')))} 個")
    lines.append(f"- 縮短版賽事（PR 不計）：{', '.join(sorted(SHORTENED_SLUGS))}")
    lines.append(f"- 現有 CSV 收錄選手：{len(current_csv)} 人")
    lines.append("")
    lines.append("## 分組統計")
    lines.append("")
    lines.append(f"| 類別 | 人數 | 處理建議 |")
    lines.append(f"| --- | --- | --- |")
    lines.append(f"| A · 新增台灣選手（中文姓名） | {len(SEC_NEW_TWN)} | 直接加進 rankings.csv |")
    lines.append(f"| B · 既有選手成績更新 | {len(SEC_IMPROVE)} | 更新 CSV 中該人的時間 |")
    lines.append(f"| C · 既有選手無變化 | {len(SEC_NO_CHANGE)} | 略過 |")
    lines.append(f"| D · 英文姓名可能是台灣 | {len(SEC_MAYBE_TWN)} | 確認後手動匹配 |")
    lines.append(f"| E · 英文姓名國籍不明 | {len(SEC_UNKNOWN)} | 確認國籍後決定 |")
    lines.append(f"| F · 僅有縮短版紀錄 | {len(SEC_SHORTENED_ONLY)} | 通常忽略 |")
    lines.append("")

    def render_athlete_block(item, header_label, show_csv=False):
        out = []
        name = item["name"]
        pr = item["pr"]
        s = pr.get("splits") or {}
        out.append(f"### {header_label} {name}")
        out.append("")
        out.append(f"- **PR**：`{pr['overall_str']}` @ {pr['race_code']} {pr['year']}（組別 {pr.get('group','-')}）")
        out.append(f"  - Swim {s.get('swim') or '—'} · T1 {s.get('t1') or '—'} · Bike {s.get('bike') or '—'} · T2 {s.get('t2') or '—'} · Run {s.get('run') or '—'}")
        out.append(f"  - 來源：{pr.get('athlete_url','')}")
        if show_csv and item.get("csv"):
            c = item["csv"]
            out.append(f"- 現有 CSV：`{fmt_sec(c['overall_sec'])}` @ {c['race']} {c['year']}")
            delta = c["overall_sec"] - pr["overall_sec"]
            out.append(f"  - 改善 **{delta // 60} 分 {delta % 60} 秒**")
        if item.get("matched_zh"):
            out.append(f"- 反查到中文名：**{item['matched_zh']}**")
        if len(item.get("all_normal", [])) > 1:
            other = item["all_normal"][1:]
            out.append(f"- 其他賽事紀錄：")
            for r in other:
                out.append(f"  - `{r['overall_str']}` @ {r['race_code']} {r['year']}")
        if item.get("shortened_records"):
            out.append(f"- 縮短版紀錄（不計入）：")
            for r in item["shortened_records"]:
                out.append(f"  - `{r['overall_str']}` @ {r['race_code']} {r['year']}（slug={r['slug']}）")
        out.append("")
        return out

    if SEC_NEW_TWN:
        lines.append("---")
        lines.append("")
        lines.append("## A · 新增台灣選手（建議直接加入 CSV）")
        lines.append("")
        SEC_NEW_TWN.sort(key=lambda x: x["pr"]["overall_sec"])
        for i, item in enumerate(SEC_NEW_TWN, 1):
            lines += render_athlete_block(item, f"A-{i}.")

    if SEC_IMPROVE:
        lines.append("---")
        lines.append("")
        lines.append("## B · 既有選手成績更新（建議更新 CSV）")
        lines.append("")
        SEC_IMPROVE.sort(key=lambda x: x["pr"]["overall_sec"])
        for i, item in enumerate(SEC_IMPROVE, 1):
            lines += render_athlete_block(item, f"B-{i}.", show_csv=True)

    if SEC_NO_CHANGE:
        lines.append("---")
        lines.append("")
        lines.append("## C · 既有選手無變化（僅供確認，跳過即可）")
        lines.append("")
        for item in sorted(SEC_NO_CHANGE, key=lambda x: x["pr"]["overall_sec"]):
            pr = item["pr"]
            c = item["csv"]
            lines.append(f"- **{item['name']}**：CSV `{fmt_sec(c['overall_sec'])}` @ {c['race']} {c['year']} ｜ Bravelog 找到 `{pr['overall_str']}` @ {pr['race_code']} {pr['year']}（沒更好）")
        lines.append("")

    if SEC_MAYBE_TWN:
        lines.append("---")
        lines.append("")
        lines.append("## D · 英文姓名疑似台灣選手（請確認）")
        lines.append("")
        SEC_MAYBE_TWN.sort(key=lambda x: x["pr"]["overall_sec"])
        for i, item in enumerate(SEC_MAYBE_TWN, 1):
            lines += render_athlete_block(item, f"D-{i}.")

    if SEC_UNKNOWN:
        lines.append("---")
        lines.append("")
        lines.append("## E · 英文姓名國籍不明（多為國際選手）")
        lines.append("")
        SEC_UNKNOWN.sort(key=lambda x: x["pr"]["overall_sec"])
        for i, item in enumerate(SEC_UNKNOWN, 1):
            pr = item["pr"]
            lines.append(f"- **{item['name']}**：PR `{pr['overall_str']}` @ {pr['race_code']} {pr['year']}（組別 {pr.get('group','-')}）")
        lines.append("")

    if SEC_SHORTENED_ONLY:
        lines.append("---")
        lines.append("")
        lines.append("## F · 僅有縮短版紀錄（不列入歷代榜）")
        lines.append("")
        SEC_SHORTENED_ONLY.sort(key=lambda x: x["pr"]["overall_sec"])
        for item in SEC_SHORTENED_ONLY:
            pr = item["pr"]
            lines.append(f"- **{item['name']}**：`{pr['overall_str']}` @ {pr['race_code']} {pr['year']}（slug={pr['slug']}）")
        lines.append("")

    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n✓ 寫入報告：{OUT_PATH}")
    print(f"\n統計：")
    print(f"  A · 新增台灣：       {len(SEC_NEW_TWN):3} 人")
    print(f"  B · 既有改善：       {len(SEC_IMPROVE):3} 人")
    print(f"  C · 既有無變化：     {len(SEC_NO_CHANGE):3} 人")
    print(f"  D · 英文疑似台灣：   {len(SEC_MAYBE_TWN):3} 人")
    print(f"  E · 英文國籍不明：   {len(SEC_UNKNOWN):3} 人")
    print(f"  F · 僅縮短版紀錄：   {len(SEC_SHORTENED_ONLY):3} 人")


if __name__ == "__main__":
    main()
