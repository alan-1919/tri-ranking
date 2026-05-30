# 候選審查報告 · Bravelog 爬蟲合併結果

- 來源 raw 檔案：36 個
- 縮短版賽事（PR 不計）：2024042701, 2025041303
- 現有 CSV 收錄選手：31 人

## 分組統計

| 類別 | 人數 | 處理建議 |
| --- | --- | --- |
| A · 新增台灣選手（中文姓名） | 0 | 直接加進 rankings.csv |
| B · 既有選手成績更新 | 1 | 更新 CSV 中該人的時間 |
| C · 既有選手無變化 | 27 | 略過 |
| D · IRONMAN 確認 TWN 但缺中文名 | 7 | 手動補中文姓名到 ATHLETES_EN |
| E · 國籍不明 | 0 | 多為國際選手，捨棄 |
| F · 僅有縮短版紀錄 | 43 | 通常忽略 |

---

## B · 既有選手成績更新（建議更新 CSV）

### B-1. 廖健妤

- **PR**：`12:21:43` @ IM Penghu 2026（組別 -）
  - Swim 01:13:13 · T1 00:05:27 · Bike 06:47:02 · T2 — · Run 04:09:14
  - 來源：https://www.ironman.com/im-taiwan-results
- 現有 CSV：`12:26:49` @ 普悠瑪 2023
  - 改善 **5 分 6 秒**
- 其他賽事紀錄：
  - `12:26:49` @ 普悠瑪 2023

---

## C · 既有選手無變化（僅供確認，跳過即可）

- **陳俐妘**：CSV `09:56:59` @ CT 2023 ｜ Bravelog 找到 `09:56:59` @ CT 2023（沒更好）
- **郭家齊**：CSV `10:09:12` @ 普悠瑪 2023 ｜ Bravelog 找到 `10:09:12` @ 普悠瑪 2023（沒更好）
- **洪筱婷**：CSV `10:49:19` @ 普悠瑪 2023 ｜ Bravelog 找到 `10:49:19` @ 普悠瑪 2023（沒更好）
- **鍾天晴**：CSV `10:56:36` @ 普悠瑪 2023 ｜ Bravelog 找到 `10:56:36` @ 普悠瑪 2023（沒更好）
- **楊宜靜**：CSV `11:02:29` @ 普悠瑪 2021 ｜ Bravelog 找到 `11:02:29` @ 普悠瑪 2021（沒更好）
- **吳依玫**：CSV `11:13:39` @ IM Penghu 2026 ｜ Bravelog 找到 `11:13:39` @ IM Penghu 2026（沒更好）
- **郭慧希**：CSV `10:49:54` @ 普悠瑪 2024 ｜ Bravelog 找到 `11:14:44` @ IM Penghu 2026（沒更好）
- **李秀如**：CSV `11:14:59` @ 普悠瑪 2020 ｜ Bravelog 找到 `11:14:58` @ 普悠瑪 2020（沒更好）
- **許靜怡**：CSV `10:46:57` @ 普悠瑪 2025 ｜ Bravelog 找到 `11:21:04` @ IM Taiwan 2022（沒更好）
- **徐慧安**：CSV `11:02:55` @ 普悠瑪 2026 ｜ Bravelog 找到 `11:32:12` @ 普悠瑪 2023（沒更好）
- **林吟霞**：CSV `11:06:13` @ 臺東超鐵 2022 ｜ Bravelog 找到 `11:34:36` @ 普悠瑪 2023（沒更好）
- **陳玉玲**：CSV `11:37:34` @ 普悠瑪 2020 ｜ Bravelog 找到 `11:37:34` @ 普悠瑪 2020（沒更好）
- **李淳潔**：CSV `11:44:06` @ 普悠瑪 2023 ｜ Bravelog 找到 `11:44:06` @ 普悠瑪 2023（沒更好）
- **莊雅婷**：CSV `11:45:26` @ IM Taiwan 2022 ｜ Bravelog 找到 `11:45:26` @ IM Taiwan 2022（沒更好）
- **梁蘭麗**：CSV `11:52:12` @ 普悠瑪 2021 ｜ Bravelog 找到 `11:52:12` @ 普悠瑪 2021（沒更好）
- **陳知輿**：CSV `11:52:45` @ CT 2023 ｜ Bravelog 找到 `11:52:45` @ CT 2023（沒更好）
- **連雪涵**：CSV `11:55:05` @ 普悠瑪 2023 ｜ Bravelog 找到 `11:55:05` @ 普悠瑪 2023（沒更好）
- **陳明煥**：CSV `11:56:25` @ 普悠瑪 2020 ｜ Bravelog 找到 `11:56:25` @ 普悠瑪 2020（沒更好）
- **高玉美**：CSV `11:58:36` @ 普悠瑪 2023 ｜ Bravelog 找到 `11:58:36` @ 普悠瑪 2023（沒更好）
- **李宜芳**：CSV `12:07:15` @ CT 2021 ｜ Bravelog 找到 `12:07:15` @ CT 2021（沒更好）
- **林怡君**：CSV `11:30:37` @ 普悠瑪 2022 ｜ Bravelog 找到 `12:09:12` @ Im World-Championship-Kona 2025（沒更好）
- **陳慧菁**：CSV `12:10:19` @ 普悠瑪 2021 ｜ Bravelog 找到 `12:10:19` @ 普悠瑪 2021（沒更好）
- **黃佩婷**：CSV `11:22:30` @ 普悠瑪 2026 ｜ Bravelog 找到 `12:17:02` @ IM Penghu 2026（沒更好）
- **羅紹萍**：CSV `11:16:51` @ IM Korea 2026 ｜ Bravelog 找到 `12:19:49` @ CT 2020（沒更好）
- **趙瑞娟**：CSV `12:23:43` @ 普悠瑪 2023 ｜ Bravelog 找到 `12:23:43` @ 普悠瑪 2023（沒更好）
- **賴柏伶**：CSV `12:24:48` @ CT 2023 ｜ Bravelog 找到 `12:24:48` @ CT 2023（沒更好）
- **蔡文雅**：CSV `12:27:11` @ 普悠瑪 2020 ｜ Bravelog 找到 `12:27:11` @ 普悠瑪 2020（沒更好）

---

## D · IRONMAN 確認 TWN 但缺中文姓名（請補 ATHLETES_EN）

以下選手 IRONMAN.com 標記為 `iso3=TWN`，確定是台灣選手，但 `data.js` 的 `ATHLETES_EN` 對照表中找不到對應的中文姓名。
請憑印象或查證後，到 `data.js` 增加對映，例如：`"陳XX": "WenHui Chen",`

### D-1. Lin Chiu

- **PR**：`10:58:05` @ IM Penghu 2026（組別 -）
  - Swim 00:54:52 · T1 00:04:38 · Bike 05:32:35 · T2 — · Run 04:21:35
  - 來源：https://www.ironman.com/im-taiwan-results

  - 推測中文姓：**林/邱**
  - 現有 CSV 同姓選手（可比對是否同一人）：林吟霞, 林怡君

### D-2. WenHui Chen

- **PR**：`11:39:03` @ IM Penghu 2026（組別 -）
  - Swim 01:24:22 · T1 00:05:50 · Bike 06:08:03 · T2 — · Run 03:57:23
  - 來源：https://www.ironman.com/im-taiwan-results

  - 推測中文姓：**陳**
  - 現有 CSV 同姓選手（可比對是否同一人）：陳俐妘, 陳玉玲, 陳知輿, 陳明煥, 陳慧菁

### D-3. CHUN-JIE LI

- **PR**：`11:45:27` @ IM Penghu 2026（組別 -）
  - Swim 01:06:50 · T1 00:06:19 · Bike 05:50:36 · T2 — · Run 04:36:26
  - 來源：https://www.ironman.com/im-taiwan-results

  - 推測中文姓：**李**
  - 現有 CSV 同姓選手（可比對是否同一人）：李筱瑜, 李秀如, 李淳潔, 李宜芳

### D-4. Yi Fan Chen

- **PR**：`11:58:56` @ IM Penghu 2026（組別 -）
  - Swim 01:19:47 · T1 00:10:54 · Bike 06:09:48 · T2 — · Run 04:11:53
  - 來源：https://www.ironman.com/im-taiwan-results

  - 推測中文姓：**陳**
  - 現有 CSV 同姓選手（可比對是否同一人）：陳俐妘, 陳玉玲, 陳知輿, 陳明煥, 陳慧菁

### D-5. Chin Ting Hsu

- **PR**：`12:18:39` @ IM Subic Bay 2024（組別 -）
  - Swim 01:31:07 · T1 00:05:16 · Bike 06:08:00 · T2 — · Run 04:24:54
  - 來源：https://www.ironman.com/im-philippines-results

  - 推測中文姓：**許**
  - 現有 CSV 同姓選手（可比對是否同一人）：許靜怡

### D-6. TZU WEI LIAO

- **PR**：`12:21:03` @ IM Penghu 2026（組別 -）
  - Swim 01:16:27 · T1 00:07:31 · Bike 06:25:22 · T2 — · Run 04:26:37
  - 來源：https://www.ironman.com/im-taiwan-results

  - 推測中文姓：**廖**
  - 現有 CSV 同姓選手（可比對是否同一人）：廖健妤

### D-7. Fei Kuo

- **PR**：`12:25:56` @ IM Vietnam 2026（組別 -）
  - Swim 01:22:03 · T1 00:05:18 · Bike 06:12:46 · T2 — · Run 04:40:18
  - 來源：https://www.ironman.com/im-vietnam-results

  - 推測中文姓：**郭**
  - 現有 CSV 同姓選手（可比對是否同一人）：郭家齊, 郭慧希

---

## F · 僅有縮短版紀錄（不列入歷代榜）

- **TSCHAN Chinouk**：`10:00:33` @ IM Penghu 2025（slug=2025041303）
- **WAKATSUKI Yurika**：`10:07:51` @ IM Penghu 2025（slug=2025041303）
- **SEEFRIED Jenna Caer**：`10:08:52` @ IM Penghu 2025（slug=2025041303）
- **QIAO Beibei**：`10:29:27` @ IM Penghu 2025（slug=2025041303）
- **ICHIA Huang**：`10:32:34` @ IM Penghu 2025（slug=2025041303）
- **TAMURA Hikari**：`10:34:33` @ IM Penghu 2025（slug=2025041303）
- **YEUNG Tsz Han**：`10:42:51` @ IM Penghu 2025（slug=2025041303）
- **JIHO HWANG**：`10:46:37` @ CT 2024（slug=2024042701）
- **FUJITA Satomi**：`10:53:54` @ IM Penghu 2025（slug=2025041303）
- **YAMASHITA Chigusa**：`10:54:25` @ IM Penghu 2025（slug=2025041303）
- **COBOS Carolina**：`10:54:26` @ IM Penghu 2025（slug=2025041303）
- **HENDERSON Melanie**：`10:54:35` @ IM Penghu 2025（slug=2025041303）
- **OTA Narumi**：`10:56:31` @ IM Penghu 2025（slug=2025041303）
- **CAI Chao**：`11:01:59` @ IM Penghu 2025（slug=2025041303）
- **ARELLANO Marialuz**：`11:09:59` @ IM Penghu 2025（slug=2025041303）
- **CHEN Wenhui**：`11:13:36` @ IM Penghu 2025（slug=2025041303）
- **BOEHM Simone**：`11:18:38` @ IM Penghu 2025（slug=2025041303）
- **WANG I Chen**：`11:21:48` @ IM Penghu 2025（slug=2025041303）
- **LI Chun Jie**：`11:25:12` @ IM Penghu 2025（slug=2025041303）
- **CHIU Chienlin**：`11:25:32` @ IM Penghu 2025（slug=2025041303）
- **KRARUNPETCH Pannapat**：`11:28:11` @ IM Penghu 2025（slug=2025041303）
- **OTSU Nana**：`11:31:48` @ IM Penghu 2025（slug=2025041303）
- **CHEN Li Tung**：`11:33:00` @ IM Penghu 2025（slug=2025041303）
- **PROUTY Nada**：`11:35:35` @ IM Penghu 2025（slug=2025041303）
- **LIN Hsiulu**：`11:42:46` @ IM Penghu 2025（slug=2025041303）
- **CHEN Huey Jing**：`11:44:19` @ IM Penghu 2025（slug=2025041303）
- **KLUMPP REINEMUTH Leoni**：`11:47:28` @ IM Penghu 2025（slug=2025041303）
- **SYNENKA Valentyna**：`11:48:08` @ IM Penghu 2025（slug=2025041303）
- **PAN Jolie**：`11:51:29` @ IM Penghu 2025（slug=2025041303）
- **MITCHELL Mary**：`11:51:38` @ IM Penghu 2025（slug=2025041303）
- **CHEN Hsun Ling**：`11:53:55` @ IM Penghu 2025（slug=2025041303）
- **SVOBODA PAULINA**：`11:54:43` @ CT 2024（slug=2024042701）
- **POVEDA FRANCO Maria Fernanda**：`11:57:30` @ IM Penghu 2025（slug=2025041303）
- **SHIRATO Ayako**：`12:03:32` @ IM Penghu 2025（slug=2025041303）
- **LIN Tzu Yang**：`12:06:40` @ IM Penghu 2025（slug=2025041303）
- **陳玟卉**：`12:07:23` @ CT 2024（slug=2024042701）
- **CHANG Hsun Yun**：`12:12:01` @ IM Penghu 2025（slug=2025041303）
- **CHIU Wen Mei**：`12:17:17` @ IM Penghu 2025（slug=2025041303）
- **WANG Feng Yi**：`12:18:55` @ IM Penghu 2025（slug=2025041303）
- **HSU Chien Wei**：`12:19:49` @ IM Penghu 2025（slug=2025041303）
- **AOKI Chieko**：`12:20:54` @ IM Penghu 2025（slug=2025041303）
- **王怡蓁**：`12:22:32` @ CT 2024（slug=2024042701）
- **LIAO Tzu Wei**：`12:23:50` @ IM Penghu 2025（slug=2025041303）
