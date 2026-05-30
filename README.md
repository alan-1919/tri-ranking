# 台灣女子 226 公里長距離鐵人三項 · 歷代前 20 傑

公開靜態網站，呈現台灣國籍女性選手於全球 226 公里全程鐵人三項（游泳 3.8 km + 自行車 180 km + 跑步 42.2 km）之歷代最佳成績。

---

## 兩件事就能維護整個網站

1. **編輯 `rankings.csv`**（成績資料）
2. **用 GitHub Desktop push 上去**（自動發布）

不用跑任何指令、不用寫程式。下面分別說明。

---

## 一、編輯 `rankings.csv`

### 推薦的編輯工具

| 工具 | 中文支援 | 推薦程度 |
| --- | --- | --- |
| **Google Sheets** | 完美 UTF-8 | ⭐⭐⭐ 最推薦 |
| **Numbers**（Mac 內建） | 完美 UTF-8 | ⭐⭐⭐ 推薦 |
| **Excel for Mac** | 需注意儲存格式 | ⭐⭐ 可用 |
| **VS Code / 文字編輯器** | 完美 UTF-8 | ⭐⭐ 可用（適合改少量欄位） |

### Excel 使用注意（避免中文亂碼）

CSV 已加上 UTF-8 BOM，**打開時**不會亂碼，但**儲存時**請務必確認格式：

- **Mac Excel**：另存新檔 → 檔案格式選 **「CSV UTF-8 (.csv)」**（不是普通的 CSV）
- **Windows Excel**：同上，選 **「CSV UTF-8（逗號分隔）」**

若選成一般 CSV，中文會被存成 Big5 或系統預設編碼，網站讀取時會變亂碼。

**最保險的做法**：用 Google Sheets 編輯 → 檔案 → 下載 → 逗號分隔值 (.csv)。

### CSV 欄位說明

| 欄位 | 必填 | 說明 | 範例 |
| --- | --- | --- | --- |
| `rank` | ✓ | 歷代排名 | `1` |
| `name` | ✓ | 中文姓名 | `李筱瑜` |
| `country` | ✓ | ISO 三字代碼 | `TWN` |
| `race` | ✓ | 賽事代號（需在 `data.js` 對應） | `IM Frankfurt` |
| `year` | ✓ | 西元年份 | `2017` |
| `swim` | ✓ | 游泳時間 `HH:MM:SS` | `01:06:11` |
| `t1` | | 轉換 1 | `00:06:51` |
| `bike` | ✓ | 自行車時間 | `05:04:00` |
| `t2` | | 轉換 2 | `00:03:50` |
| `run` | ✓ | 跑步時間 | `03:21:17` |
| `overall` | ✓ | 總成績 | `09:37:10` |
| `overall_pos` | | 當日總名次 | `1` |
| `notes` | | 備註標籤 | `退役 · Retired` |
| `bio` | | 選手簡介 | `台灣首位職業女子...` |
| `source` | | 成績來源網址 | `https://...` |
| `source_label` | | 來源顯示文字 | `官方成績頁` |
| `photo` | | 選手照片路徑（相對於 repo 根目錄） | `images/athletes/li-2017.jpg` |

**時間格式**：一律 `HH:MM:SS` 三段，個位數補 0（`01:06:11` ✓，`1:6:11` ✗）。
**空值**：留空即可，網站會顯示 `—`（或斜紋預留塊，視欄位而定）。

### 選手照片

`photo` 欄位留空 → 顯示斜紋預留塊。要放真實照片：
1. 把照片放到 `images/athletes/` 資料夾（建議方形 JPG/PNG，至少 400×400 px）
2. 在 `rankings.csv` 該選手的 `photo` 欄位填入相對路徑，例如 `images/athletes/li-2017.jpg`
3. commit + push，照片自動出現在排行榜（頒獎台 72×72、表格 36×36、手機卡片 44×44、Modal 120×120）

### 新增選手時要做的事

新增一列到 `rankings.csv` **之後**，還要在 `data.js` 補英文姓名對照（拼音不放在 CSV，是為了讓 CSV 保持單純）：

```js
const ATHLETES_EN = {
  "李筱瑜": "Hsiao-Yu Li",
  ...
  "新選手": "Xin Xuan-Shou",   // ← 加這行
};
```

### 新增賽事時要做的事

`rankings.csv` 的 `race` 欄填新代號之後，到 `data.js` 加入賽事中英文對照：

```js
const RACES = {
  ...
  "IM Kona": { zh: "IM 科納", en: "IRONMAN World Championship", region: "USA" },
};
```

### 別忘了：更新最後資料更新日期

在 `data.js` 開頭：

```js
const META = {
  lastUpdated: "2026.05.28",   // ← 改成 push 當天的日期
  ...
};
```

---

## 二、用 GitHub Desktop 上傳

### 第一次設定（只做一次）

1. **建立 Git repo**
   - 打開 GitHub Desktop
   - File → **Add Local Repository** → 選 `tri-ranking` 資料夾
   - 若提示「This directory does not appear to be a Git repository」，點 **Create a Repository**
2. **發布到 GitHub**
   - 右上角 **Publish repository**
   - 取名（如 `tri-ranking-twn-w226`）
   - 勾 **Public**（這樣才能用免費 GitHub Pages）
3. **打開 GitHub Pages**
   - 到 GitHub 網頁 → repo → Settings → Pages
   - Source 選 **Deploy from a branch**
   - Branch 選 **main** + **/ (root)** → Save
4. **等 1～2 分鐘**，網址會是 `https://<你的帳號>.github.io/<repo-name>/`

### 之後的更新流程（每次）

1. 編輯 `rankings.csv`（與 `data.js`，如果有新選手或新賽事）
2. GitHub Desktop 會自動偵測變更
3. 左下角寫 commit message（例：`更新 2026 春季資料`）
4. 點 **Commit to main**
5. 點 **Push origin**
6. 等幾分鐘 → 網站自動更新

---

## 常見問題

**Q：Excel 開啟 rankings.csv 中文是亂碼**
A：你可能用了「Comma Separated Values (.csv)」開啟。改用 Google Sheets，或在 Excel 另存時選「CSV UTF-8」。

**Q：在 GitHub 上看到 push 成功，但網站還是舊的**
A：兩個可能：
- GitHub Pages 還在部署（看 repo 的 **Actions** 頁籤，綠勾才是完成）
- 瀏覽器快取——按 `Cmd + Shift + R` 強制重整

**Q：新增選手後排行榜沒顯示英文名**
A：英文姓名要在 `data.js` 的 `ATHLETES_EN` 對照表手動加，CSV 只放中文姓名。

**Q：我想在本機預覽再 push**
A：在 `tri-ranking` 資料夾起本機 server：

```bash
cd "/path/to/tri-ranking"
python3 -m http.server 8000
# 開瀏覽器：http://localhost:8000/
```

直接點兩下開 `index.html` 不會動——瀏覽器的 CORS 政策不允許 `file://` 抓取 CSV。

---

## 檔案結構（供參考）

```
tri-ranking/
├── rankings.csv          ← 你會編輯的檔案
├── data.js               ← 英文姓名 / 賽事對照、最後更新日期
├── index.html            ← 主排行榜頁
├── about.html            ← 方法說明頁
├── compare.html          ← 版面對照頁（保留備用）
├── styles.css            ← 樣式（通常不需要動）
├── main.jsx              ← 主頁邏輯（通常不需要動）
├── variations.jsx        ← 表格元件（通常不需要動）
├── modal.jsx             ← 選手詳情 Modal（通常不需要動）
├── design-canvas.jsx     ← compare.html 用（通常不需要動）
├── main-compare.jsx      ← compare.html 入口（通常不需要動）
├── README.md             ← 本文件
└── .gitignore
```

**會編到**：`rankings.csv`、`data.js`。其他檔案除非要改設計，不用碰。
