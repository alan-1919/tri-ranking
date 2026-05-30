#!/usr/bin/env python3
"""
normalize.py — 將 rankings.csv 正規化

修正三件事：
1. 補時間欄位前導零（swim/t1/bike/t2/run/overall 都改成 HH:MM:SS）
2. 確保有單一 UTF-8 BOM（Excel 友善）
3. 移除累積的重複 BOM

冪等（idempotent）：跑兩次結果一樣。
"""

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "rankings.csv"

TIME_COLS = ["swim", "t1", "bike", "t2", "run", "overall"]


def pad_time(s: str) -> str:
    if not s or "--" in s:
        return s
    parts = s.split(":")
    if len(parts) != 3:
        return s
    try:
        return ":".join(p.zfill(2) for p in parts)
    except Exception:
        return s


def main() -> int:
    if not CSV_PATH.exists():
        print(f"找不到 {CSV_PATH}", file=sys.stderr)
        return 1

    raw = CSV_PATH.read_bytes()
    # 剝掉所有開頭的 BOM bytes
    while raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    # 解碼後再清除可能殘留的 U+FEFF（內嵌 BOM 字元）
    text = raw.decode("utf-8").lstrip("﻿")

    reader = csv.DictReader(text.splitlines())
    fieldnames = reader.fieldnames
    rows = list(reader)

    padded = 0
    for r in rows:
        for col in TIME_COLS:
            old = r.get(col, "")
            new = pad_time(old)
            if old != new:
                padded += 1
            r[col] = new

    # 寫回（單一 BOM）
    buf = [",".join(fieldnames)]
    for r in rows:
        cells = [str(r.get(fn, "")) for fn in fieldnames]
        def esc(s):
            if "," in s or '"' in s:
                return '"' + s.replace('"', '""') + '"'
            return s
        buf.append(",".join(esc(c) for c in cells))
    output = "\n".join(buf) + "\n"
    out_bytes = b"\xef\xbb\xbf" + output.encode("utf-8")

    if out_bytes == CSV_PATH.read_bytes():
        print("已是正規化狀態，不需更動")
        return 0

    CSV_PATH.write_bytes(out_bytes)
    print(f"✓ 正規化完成（{padded} 個時間欄位補了前導零）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
