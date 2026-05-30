# 選手照片資料夾

把選手照片放這裡（建議格式：方形 JPG/PNG/WebP，至少 400×400 px）。

## 命名建議

使用「年份-姓氏拼音」或「rank 編號」便於辨識，例如：
- `li-2017.jpg`（李筱瑜 IM Frankfurt 2017）
- `chen-2023.jpg`（陳俐妘 CT 2023）
- `athlete-04.jpg`（一般編號）

實際檔名只要對應 `rankings.csv` 的 `photo` 欄位即可。

## 在 CSV 中啟用

打開 `rankings.csv`，在該選手的 `photo` 欄位填入相對路徑：

```csv
1,李筱瑜,TWN,IM Frankfurt,2017,...,images/athletes/li-2017.jpg
```

留空 → 顯示斜紋預留塊。
