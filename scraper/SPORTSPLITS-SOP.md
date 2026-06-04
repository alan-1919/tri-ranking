# SportSplits 爬蟲 SOP

從 [sportsplits.com](https://www.sportsplits.com) 抓單場賽事成績的標準流程。

> **為什麼這個流程要人工存 HTML？**
>
> sportsplits 對 `/events/*` 深頁開了 Cloudflare WAF 主動防護——Playwright、curl_cffi、即使呼叫真實系統 Chrome 都拿不到資料。**唯一穩定的方式是：你在自己的瀏覽器打開頁面，網頁完整載入後 Cmd+S 存檔，再交給腳本解析。** 這條路繞過所有反爬，相對地需要你動手一下。

---

## 0. 一次性環境設定

只需做一次（你的 venv 應該已經有了）：

```bash
cd "/Users/alanyu/Projects/Claude Projects/tri-ranking/scraper"
uv venv .venv             # 建虛擬環境（如果還沒有）
source .venv/bin/activate
uv pip install -r requirements.txt
```

每次新開終端機前都要 `source .venv/bin/activate`。

---

## 1. 標準流程（建議優先嘗試）

### Step 1 — 找對賽事 URL

賽事 URL 形如：
```
https://www.sportsplits.com/races/<race-slug>
```
例：
- 普悠瑪 2026 → `puyuma-triathlon-day1-2026`
- Challenge Taiwan 2026 day2 → `challenge-taiwan-day2-2026`

### Step 2 — 嘗試**深頁**（只有 Female、資料最乾淨）

把 URL 改成：
```
https://www.sportsplits.com/races/<race-slug>/events/1/gender/Female
```

`/events/1/` 通常是「226K 個人組」；其他可能值：
- `/events/2/` = 226K 接力組
- `/events/3/` = 113K 個人組
- `/events/4/` = 113K 接力組

在 **Chrome / Safari** 打開這個 URL：

- ✅ **網頁完整載入、看到 Female 選手 table** → 直接 Cmd+S 存檔，跳 Step 3
- 🟡 **看到「Just a moment / 請稍候」**：等 30 秒讓 Cloudflare 過；過了再 Cmd+S
- 🔴 **無論等多久都過不了**（少數情況）：跳到「混合頁備援」章節

### Step 3 — 存檔

`Cmd + S`：

| 設定 | 選 |
| --- | --- |
| 格式 | **「網頁，僅 HTML」**（不要選「完整網頁」會多存圖檔） |
| 存到 | 桌面或 Downloads 都行 |
| 檔名 | 預設就好 |

### Step 4 — 跑 scraper

```bash
cd "/Users/alanyu/Projects/Claude Projects/tri-ranking/scraper"
source .venv/bin/activate
python3 sportsplits.py "/Users/alanyu/Desktop/你存的檔名.html"
```

預期終端機輸出：

```
[info] slug = challenge-taiwan-day2-2026
[info] HTML 內找到 1 個 u-table--v1：
  [0] gender=Female  event_id=1   label='CT 226k Individual'
[info] 只有 1 個 table，直接使用

✓ 抓到 50 位 Female 完賽（≤15 小時）

  10:55:06  AYAKA SUZUKI    #1594  [35-39]
  11:44:48  曾郁雅          #1599  [35-39]
  ... 完整名單 ...

✓ 寫入 .../raw/sp-challenge-taiwan-day2-2026-e1.json
```

完成。

---

## 2. 備援流程（深頁過不去時）

### 2a. 退到「主頁」（每組只 top 3）

主頁 URL：
```
https://www.sportsplits.com/races/<race-slug>
```

主頁通常 Cloudflare 不擋。但缺點是 **每個分組只列 top 3**（適合女子完賽人數本來就少的賽事，例：普悠瑪女子 226 常常 3-5 人）。

Cmd+S 存檔後：

```bash
python3 sportsplits.py "/Users/alanyu/Desktop/主頁存的檔.html" --event 1 --gender Female
```

腳本會從多個 table 中**自動挑** `event_id=1 + gender=Female` 的那一個。

### 2b. 退到「226K 競賽組混合頁」（包含全部男女）

URL：
```
https://www.sportsplits.com/races/<race-slug>/events/1
```

這頁 column 沒分男女，但選手是全部完賽人。需要篩出女子。

#### 方法 1：用 category 過濾（如果賽事有 F30 / F35 / F40 等女子分組）

```bash
python3 sportsplits.py file.html --filter-categories 'F.*'
```

#### 方法 2：用 bib 號白名單（最保險，從主頁查到女子 bib 後用）

```bash
python3 sportsplits.py file.html --filter-bibs 702,755,688
```

> **取得女子 bib 號的方法**：先用「2a 主頁流程」抓到 top 3 女子的 bib，再把這些 bib 餵給混合頁。

---

## 3. 進階參數

| 選項 | 作用 |
| --- | --- |
| `--slug 字串` | 強制指定 race slug（不給就從 HTML 內自動偵測） |
| `--event N` | 多 event 賽事的 event id（預設 1） |
| `--gender Female / Male` | 預設 Female |
| `--max-hours N` | 排除超過 N 小時的 DNF（預設 15） |
| `--out 路徑` | 輸出目錄（預設 `../raw`） |
| `--dry-run` | 只解析不寫檔（測試用） |
| `--filter-categories 'pattern'` | regex prefix，符合的留下；多個用逗號分隔 |
| `--filter-bibs 'A,B,C'` | bib 白名單 |

完整說明：

```bash
python3 sportsplits.py --help
```

---

## 4. 輸出 JSON 格式

```
raw/sp-<slug>-e<event>.json
```

範例：`raw/sp-challenge-taiwan-day2-2026-e1.json`

結構：

```json
{
  "slug": "challenge-taiwan-day2-2026",
  "source": "sportsplits",
  "event_id": 1,
  "gender": "Female",
  "contest_url": "https://www.sportsplits.com/races/...",
  "race_name": "Female - CT 226k Individual - Challenge Taiwan Day 2 (2026)",
  "max_hours_filter": 15,
  "athletes": [
    {
      "name": "曾郁雅",
      "bib": "1599",
      "group": "35-39",
      "club": "...",
      "overall_str": "11:44:48",
      "overall_sec": 42288,
      "athlete_url": "https://www.sportsplits.com/races/.../individuals/1599",
      "splits": {
        "swim": "01:35:14",
        "t1": "00:11:58",
        "bike": "05:57:49",
        "t2": "00:07:18",
        "run": "03:52:27"
      }
    }
  ]
}
```

跟 `raw/` 內既有的 Bravelog（`{slug}.json`）/ IRONMAN（`im-*.json`）格式對齊，可以直接被 `merge.py` 讀取。

---

## 5. 整合到 rankings.csv（注意）

跑完 sportsplits 拿到 `raw/sp-*.json` 後，要進排行表還要兩步：

### Step A — 跑 merge.py 看 candidates 報告

```bash
cd scraper
source .venv/bin/activate
python3 merge.py
```

這會更新 `scraper/candidates_review.md`，列出：
- 新發現的台灣女子選手
- 既有選手有更好成績的候選

**`merge.py` 不會動 `rankings.csv`，純報告。**

### Step B — 確認 OK 後跑 apply.py

```bash
python3 apply.py
```

⚠️ **目前限制**：`merge.py` / `apply.py` 的 `RACE_CODE_BY_SLUG` 對照表還沒包含 sportsplits 的 slug，會把 sportsplits raw 視為「未知賽事」忽略。

要納入需要先在 `merge.py` 和 `apply.py` 兩個檔案的 `RACE_CODE_BY_SLUG` dict 加對照，例如：

```python
RACE_CODE_BY_SLUG = {
    ...
    "challenge-taiwan-day2-2026": "CT",
    "puyuma-triathlon-day1-2026": "普悠瑪",
}
```

需要時找開發者協助加。

---

## 6. 常見問題

| 症狀 | 解決方式 |
| --- | --- |
| `❌ 找不到 table.u-table--v1` | 你存到的是 Cloudflare 挑戰頁，不是真正頁面。重新在瀏覽器等網頁完整載入再 Cmd+S |
| `❌ 無法從 HTML 偵測 slug` | 加 `--slug 賽事代號` 手動指定 |
| `[0] gender=None`，挑不到 table | 確認你存的 URL 有 `/gender/Female`；或加 `--filter-bibs` 用 bib 篩 |
| 解析後 swim 顯示空字串 | 該賽事 column 沒 swim、其他分段又不完整、無法 A 法推算。先放著之後手動補 |
| Category 顯示怪字（含 "(數字)" 結尾） | 已自動處理（會剝掉「(N)」尾巴） |
| 中文姓名解析正常但 club 一直空 | sportsplits 該頁沒 representing/club column，這是正常的 |

---

## 7. SOP TL;DR

```
[Chrome 開 URL]
        ↓
[等網頁完整載入]
        ↓
[Cmd+S 存「網頁，僅 HTML」]
        ↓
[python3 sportsplits.py path/to/file.html]
        ↓
[檢查終端機輸出名單對不對]
        ↓
[檔案寫入 raw/sp-{slug}-e{event}.json]
        ↓
（整合到 rankings.csv 是另一個流程，見第 5 節）
```
