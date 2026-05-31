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

# IRONMAN.com 分站 slug → race code
RACE_CODE_BY_IM_SLUG = {
    "im-taiwan": "IM Penghu",
    "im-vietnam": "IM Vietnam",
    "im-philippines": "IM Subic Bay",
    "im-cairns": "IM Cairns",
    "im-western-australia": "IM Western Australia",
    "im-new-zealand": "IM New Zealand",
    "im-frankfurt": "IM Frankfurt",
    "im-malaysia": "IM Malaysia",
}

# 縮短 swim 距離 / 資料異常 → 不計入 PR
SHORTENED_SLUGS = {
    "2025041303",  # IM 澎湖 2025：swim 1.9km
    "2024042701",  # CT 2024：T1 異常、swim 異常
    "2020101730",  # 2020 普悠瑪：swim 1.9km（縮短版，可能 COVID 期間）
}
# IRONMAN.com 上「特定年份」被縮短的賽事；用 (slug, year) tuple 標記
# 2025 IM 澎湖 swim 1.9km；2026 swim 已恢復 3.8km（看實際資料）
SHORTENED_IM_KEYS = {
    # ("im-taiwan", 2025),  # 已用 Bravelog 抓過 (slug=2025041303)，IRONMAN.com 重複
}

# 英文姓 → 中文姓對照（用於同姓候選建議；不夠完整也沒關係）
SURNAME_EN_TO_ZH = {
    "li": "李", "lee": "李",
    "chen": "陳", "chan": "陳",
    "lin": "林",
    "chang": "張", "zhang": "張",
    "wang": "王",
    "huang": "黃", "hung": "黃",
    "liao": "廖",
    "liu": "劉",
    "kuo": "郭", "ko": "郭",
    "chuang": "莊", "zhuang": "莊",
    "tsai": "蔡", "cai": "蔡",
    "liang": "梁",
    "lai": "賴",
    "lien": "連", "lian": "連",
    "kao": "高",
    "chao": "趙", "zhao": "趙",
    "hsu": "許", "xu": "許",
    "wu": "吳",
    "yang": "楊",
    "ho": "何", "he": "何",
    "lo": "羅", "luo": "羅",
    "chiu": "邱", "qiu": "邱",
    "hsiao": "蕭", "xiao": "蕭",
    "sun": "孫",
    "ma": "馬",
    "kuan": "關", "guan": "關",
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


def name_keys(en: str) -> set:
    """從英文姓名生成所有可能的標準化 key（不分大小寫、處理 hyphen、字序）"""
    if not en:
        return set()
    s = en.lower().replace("-", " ").replace(".", " ")
    tokens = [w for w in s.split() if w]
    if not tokens:
        return set()
    keys = set()
    # 變體 1：所有字 token 排序後拼接（容忍語序變化）
    keys.add(" ".join(sorted(tokens)))
    if len(tokens) >= 2:
        # 變體 2：把首尾以外當「名」拼起來 → "Li-Yun Chen" / "Li Yun Chen" / "LiYun Chen" 同義
        surname_last = tokens[-1]
        firstname_a = "".join(tokens[:-1])
        keys.add(f"{surname_last} {firstname_a}")
        # 變體 3：Asian 順序 "CHEN Liyun"
        surname_first = tokens[0]
        firstname_b = "".join(tokens[1:])
        keys.add(f"{surname_first} {firstname_b}")
    return keys


def load_athletes_en_reverse():
    """解析 data.js 的 ATHLETES_EN，建立「英文姓名各種寫法 → 中文名」反向 map"""
    rev = {}
    txt = DATA_JS.read_text(encoding="utf-8")
    block = re.search(r"const ATHLETES_EN\s*=\s*\{(.+?)\};", txt, re.DOTALL)
    if not block:
        return rev
    for m in re.finditer(r'"([^"]+)"\s*:\s*"([^"]+)"', block.group(1)):
        zh, en = m.group(1), m.group(2)
        for key in name_keys(en):
            rev[key] = zh
    return rev


def find_zh_name(rev_en: dict, en_name: str):
    """在反向 map 查找英文姓名對應的中文名"""
    for k in name_keys(en_name):
        if k in rev_en:
            return rev_en[k]
    return None


def suggest_zh_surname(en_name: str) -> str:
    """從英文姓名猜中文姓（用於候選人提示）"""
    if not en_name:
        return ""
    s = en_name.lower().replace("-", " ").replace(".", " ")
    tokens = [w for w in s.split() if w]
    candidates = set()
    # 首詞或末詞可能是姓
    for tok in (tokens[:1] + tokens[-1:]) if tokens else []:
        if tok in SURNAME_EN_TO_ZH:
            candidates.add(SURNAME_EN_TO_ZH[tok])
    return "/".join(sorted(candidates))


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
    """讀所有 raw/*.json，回傳 athlete 紀錄列表

    支援兩種 JSON 格式：
      - Bravelog（無 source 標示，slug 為 YYYYMMDD#）
      - IRONMAN.com（source=='ironman.com'，slug 如 im-taiwan）
    """
    records = []
    for f in sorted(RAW_DIR.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        slug = d["slug"]
        is_ironman = d.get("source") == "ironman.com"

        if is_ironman:
            race_code = RACE_CODE_BY_IM_SLUG.get(slug, slug.replace("im-", "IM ").title())
            year = d.get("event_year") or 0
            shortened = (slug, year) in SHORTENED_IM_KEYS
            race_url = d.get("race_url", "")
            for a in d.get("athletes", []):
                name = a["name"]
                is_taiwan = (a.get("country_iso3") == "TWN")
                matched_zh = find_zh_name(reverse_en, name) if not has_chinese(name) else None
                normalized = (matched_zh or name) if not has_chinese(name) else name
                records.append({
                    **a,
                    "slug": slug,
                    "race_code": race_code,
                    "year": year,
                    "shortened": shortened,
                    "race_url": race_url,
                    "normalized_name": normalized,
                    "matched_zh": matched_zh,
                    "is_taiwan_confirmed": is_taiwan,
                    "source_system": "ironman",
                })
        else:
            # Bravelog
            race_code = RACE_CODE_BY_SLUG.get(slug, slug)
            year = int(slug[:4]) if len(slug) >= 4 and slug[:4].isdigit() else 0
            shortened = slug in SHORTENED_SLUGS
            for a in d.get("athletes", []):
                name = a["name"]
                if has_chinese(name):
                    normalized = name
                    matched_zh = None
                    is_taiwan = True  # Bravelog 是台灣資料源
                else:
                    matched_zh = find_zh_name(reverse_en, name)
                    normalized = matched_zh if matched_zh else name
                    # 對到既有 ATHLETES_EN 才算台灣，否則未知
                    is_taiwan = matched_zh is not None
                records.append({
                    **a,
                    "slug": slug,
                    "race_code": race_code,
                    "year": year,
                    "shortened": shortened,
                    "normalized_name": normalized,
                    "matched_zh": matched_zh,
                    "is_taiwan_confirmed": is_taiwan,
                    "source_system": "bravelog",
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
    SEC_TWN_ENG_NEW = []    # IRONMAN 確認 iso3=TWN 但對不到中文 → 需手動補中文名
    SEC_UNKNOWN = []        # 國籍不明
    SEC_SHORTENED_ONLY = [] # 只有縮短版紀錄

    all_names = set(by_name_normal) | set(by_name_shortened)
    for name in all_names:
        normal = by_name_normal.get(name, [])
        shortened = by_name_shortened.get(name, [])

        if not normal:
            pr_s = min(shortened, key=lambda x: x.get("overall_sec") or 9 ** 9)
            SEC_SHORTENED_ONLY.append({"name": name, "pr": pr_s, "shortened_records": shortened})
            continue
        pr = min(normal, key=lambda x: x.get("overall_sec") or 9 ** 9)

        item = {
            "name": name,
            "pr": pr,
            "all_normal": sorted(normal, key=lambda x: x.get("overall_sec") or 9 ** 9),
            "shortened_records": shortened,
        }

        # 判斷 normalized_name 是中文 or 英文（影響後續分類）
        is_chinese = has_chinese(name)
        # is_taiwan_confirmed 取自任一筆紀錄（同一 normalized_name 都應一致）
        is_taiwan = any(r.get("is_taiwan_confirmed") for r in normal + shortened)

        if name in current_csv:
            csv_sec = current_csv[name]["overall_sec"]
            item["csv"] = current_csv[name]
            if pr["overall_sec"] < csv_sec - 60:  # 改善需 > 60 秒才算
                SEC_IMPROVE.append(item)
            else:
                SEC_NO_CHANGE.append(item)
        elif is_chinese:
            SEC_NEW_TWN.append(item)
        elif is_taiwan:
            # IRONMAN 確認 TWN 但 ATHLETES_EN 對不到 → 新台灣選手英文名
            item["surname_hint"] = suggest_zh_surname(name)
            # 找 CSV 中同姓的候選人
            similar_in_csv = []
            for csv_name in current_csv.keys():
                if item["surname_hint"] and any(s in csv_name for s in item["surname_hint"].split("/")):
                    similar_in_csv.append(csv_name)
            item["similar_in_csv"] = similar_in_csv
            SEC_TWN_ENG_NEW.append(item)
        else:
            SEC_UNKNOWN.append(item)

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
    lines.append(f"| D · IRONMAN 確認 TWN 但缺中文名 | {len(SEC_TWN_ENG_NEW)} | 手動補中文姓名到 ATHLETES_EN |")
    lines.append(f"| E · 國籍不明 | {len(SEC_UNKNOWN)} | 多為國際選手，捨棄 |")
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
        source = pr.get("athlete_url") or pr.get("race_url") or ""
        if source:
            out.append(f"  - 來源：{source}")
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

    if SEC_TWN_ENG_NEW:
        lines.append("---")
        lines.append("")
        lines.append("## D · IRONMAN 確認 TWN 但缺中文姓名（請補 ATHLETES_EN）")
        lines.append("")
        lines.append("以下選手 IRONMAN.com 標記為 `iso3=TWN`，確定是台灣選手，但 `data.js` 的 `ATHLETES_EN` 對照表中找不到對應的中文姓名。")
        lines.append("請憑印象或查證後，到 `data.js` 增加對映，例如：`\"陳XX\": \"WenHui Chen\",`")
        lines.append("")
        SEC_TWN_ENG_NEW.sort(key=lambda x: x["pr"]["overall_sec"])
        for i, item in enumerate(SEC_TWN_ENG_NEW, 1):
            lines += render_athlete_block(item, f"D-{i}.")
            if item.get("surname_hint"):
                lines.append(f"  - 推測中文姓：**{item['surname_hint']}**")
            if item.get("similar_in_csv"):
                lines.append(f"  - 現有 CSV 同姓選手（可比對是否同一人）：{', '.join(item['similar_in_csv'])}")
            lines.append("")

    if SEC_UNKNOWN:
        lines.append("---")
        lines.append("")
        lines.append("## E · 國籍不明（多為國際選手）")
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
    print(f"  A · 新增台灣（中文）：     {len(SEC_NEW_TWN):3} 人")
    print(f"  B · 既有改善：            {len(SEC_IMPROVE):3} 人")
    print(f"  C · 既有無變化：          {len(SEC_NO_CHANGE):3} 人")
    print(f"  D · TWN 但缺中文：        {len(SEC_TWN_ENG_NEW):3} 人（需手動補 ATHLETES_EN）")
    print(f"  E · 國籍不明：            {len(SEC_UNKNOWN):3} 人")
    print(f"  F · 僅縮短版紀錄：        {len(SEC_SHORTENED_ONLY):3} 人")


if __name__ == "__main__":
    main()
