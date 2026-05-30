# Bravelog 226K 女子組爬蟲

從 [Bravelog](https://www.bravelog.tw/) 抓取指定 226K 鐵人三項賽事的女子組（F* 組）成績，含完整分段（swim/T1/bike/T2/run）。

## 環境設定（只做一次）

需要 Python 3.10+。如果沒裝 `uv`，先裝：`brew install uv`。

```bash
cd scraper
uv venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

## 跑爬蟲

```bash
source .venv/bin/activate    # 每次 terminal 重開要重新 activate
python3 bravelog.py 2023031801
```

- `2023031801` = Bravelog 賽事 URL 的尾段（`https://www.bravelog.tw/contest/rank/2023031801`）
- 輸出到 `../raw/2023031801.json`
- 終端機會印出簡表，方便肉眼檢查

## 篩選條件

預設條件（可改）：
- 距離：**226K 個人組**
- 性別：**所有 F 開頭組別**（F20、F30、F40、F50...）
- 總時間：**< 12 小時**
- 排除：**DNF**（時間 = `--:--:--`）

調整：
```bash
python3 bravelog.py 2023031801 --max-hours 13   # 改成 13 小時內
python3 bravelog.py 2023031801 --dry-run        # 只列出不寫檔
python3 bravelog.py 2023031801 --out /tmp/x     # 改輸出目錄
```

## 輸出格式

`raw/{slug}.json` 結構：

```json
{
  "slug": "2023031801",
  "contest_url": "https://www.bravelog.tw/contest/rank/2023031801",
  "race_id": 452,
  "race_name": "2023普悠瑪鐵人三項226Km-個人組",
  "max_hours_filter": 12,
  "athletes": [
    {
      "name": "郭家齊",
      "bib": "000490",
      "group": "F20",
      "overall_str": "10:09:12",
      "overall_sec": 36552,
      "athlete_url": "https://www.bravelog.tw/athlete/452/000490",
      "splits": {
        "swim": "01:01:55",
        "t1": "00:02:55",
        "bike": "05:15:59",
        "t2": "00:02:15",
        "run": "03:46:08"
      }
    }
  ]
}
```

## 注意事項

- **禮貌間隔**：每次請求間隔 1 秒，避免造成 Bravelog 負擔
- **每場大約耗時**：12 小時內女子組 5–15 人 × 1 秒/請求 + 分組頁面解析 ≈ 30 秒～1 分鐘
- **Bravelog 沒有開放 API**，本爬蟲純解析 HTML，網站結構若改變可能失效
- **robots.txt 允許所有路徑**（2026 年確認），但使用前請再確認 Bravelog 服務條款

## 接下來要做的（規劃中）

1. **整理賽事清單** — 蒐集普悠瑪、Challenge Taiwan、IM 系列各年的 contest slug
2. **批次跑** — 寫一個 `run_all.py` 把整份清單跑過
3. **合併工具** — 把 `raw/*.json` → `rankings.csv`（去重、取個人最佳）
4. **自動化** — 若穩定，移到 GitHub Actions 排程
