# -*- coding: utf-8 -*-
"""
Banner 生成腳本：女力 × 台灣226km排行榜
深海軍藍背景 + 金色女力 + 選手 duotone 兩側裝飾
"""

import os
import sys
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── 路徑設定 ──────────────────────────────────────────────────
BASE = Path(__file__).parent
ATHLETES_DIR = BASE / "athletes"
TEMP_DIR = BASE / "Temp"
TEMP_DIR.mkdir(exist_ok=True)
OUT_PATH = TEMP_DIR / "banner-female-power-v2.png"
CACHE_DIR = TEMP_DIR / "rembg_nobg"
CACHE_DIR.mkdir(exist_ok=True)

# ── 尺寸 & 色彩 ───────────────────────────────────────────────
W, H = 1280, 460
SIDE_W = 410           # 左右各佔寬度
CENTER_W = W - SIDE_W * 2

BG_LEFT   = (13, 31, 60)    # #0D1F3C 深海軍藍
BG_RIGHT  = (26, 53, 96)    # #1A3560 稍亮藍
GOLD      = (212, 168, 67)  # #D4A843 暖金
GOLD_DIM  = (160, 120, 40)
WHITE     = (255, 255, 255)
DUO_DARK  = (13, 31, 60)    # duotone 暗部
DUO_LIGHT = (100, 160, 220) # duotone 亮部（鋼藍）

# 選手：動態載入全部，依字母順序排列後平均分成左右兩組
def get_all_athletes():
    exts = {".jpg", ".jpeg", ".png", ".webp"}
    files = sorted([f.name for f in ATHLETES_DIR.iterdir()
                    if f.suffix.lower() in exts])
    mid = len(files) // 2
    return files[:mid], files[mid:]

# ── 字型 ──────────────────────────────────────────────────────
FONT_DIR = Path("C:/Windows/Fonts")
def load_font(names, size):
    for name in names:
        p = FONT_DIR / name
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except Exception:
                continue
    return ImageFont.load_default()

# ── 去背（rembg，帶快取）─────────────────────────────────────
def remove_bg(src_path: Path) -> Image.Image:
    cache = CACHE_DIR / (src_path.stem + "_nobg.png")
    if cache.exists():
        print(f"  [cache] {src_path.name}")
        return Image.open(cache).convert("RGBA")
    try:
        from rembg import remove
    except ImportError:
        print("  [warn] rembg 未安裝，跳過去背，使用原圖")
        return Image.open(src_path).convert("RGBA")
    print(f"  [rembg] {src_path.name} ...")
    with open(src_path, "rb") as f:
        data = f.read()
    result = remove(data)
    img = Image.open(__import__("io").BytesIO(result)).convert("RGBA")
    img.save(cache)
    return img

# ── Duotone 處理 ─────────────────────────────────────────────
def duotone(img: Image.Image, dark=DUO_DARK, light=DUO_LIGHT) -> Image.Image:
    """RGBA 圖轉 duotone，保留 alpha"""
    rgba = np.array(img.convert("RGBA"), dtype=np.float32)
    alpha = rgba[:, :, 3:4]
    # 灰階亮度
    grey = rgba[:, :, :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    grey = grey[:, :, np.newaxis] / 255.0  # 0-1

    d = np.array(dark,  dtype=np.float32)
    l = np.array(light, dtype=np.float32)
    rgb = d[np.newaxis, np.newaxis, :] * (1 - grey) + l[np.newaxis, np.newaxis, :] * grey
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    alpha_u8 = alpha.astype(np.uint8)
    out = np.concatenate([rgb, alpha_u8], axis=2)
    return Image.fromarray(out, "RGBA")

# ── 邊緣淡出遮罩 ──────────────────────────────────────────────
def fade_mask(img: Image.Image, direction: str, fade_px: int = 180) -> Image.Image:
    """direction: 'right'=往右淡出（左側圖）, 'left'=往左淡出（右側圖）"""
    arr = np.array(img, dtype=np.float32)
    iw = img.width
    mask = np.ones(iw, dtype=np.float32)
    if direction == "right":
        start = iw - fade_px
        for x in range(start, iw):
            mask[x] = 1.0 - (x - start) / fade_px
    else:
        for x in range(0, fade_px):
            mask[x] = x / fade_px
    mask = np.clip(mask, 0, 1)
    arr[:, :, 3] = arr[:, :, 3] * mask[np.newaxis, :]
    return Image.fromarray(arr.astype(np.uint8), "RGBA")

# ── 背景漸層 ──────────────────────────────────────────────────
def make_bg(w, h) -> Image.Image:
    bg = Image.new("RGBA", (w, h))
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    for x in range(w):
        t = x / (w - 1)
        r = int(BG_LEFT[0] * (1 - t) + BG_RIGHT[0] * t)
        g = int(BG_LEFT[1] * (1 - t) + BG_RIGHT[1] * t)
        b = int(BG_LEFT[2] * (1 - t) + BG_RIGHT[2] * t)
        arr[:, x, :] = [r, g, b, 255]
    return Image.fromarray(arr, "RGBA")

# ── 置中貼圖輔助 ──────────────────────────────────────────────
def paste_centered(canvas, img, cx, cy):
    x = cx - img.width // 2
    y = cy - img.height // 2
    canvas.alpha_composite(img, (x, y))

# ── 從原圖擷取書法「女力」筆跡 ───────────────────────────────
def extract_calligraphy(orig_path: Path, target_h: int = 280) -> Image.Image:
    """
    從原始 banner 擷取深藍書法字，轉為白色 RGBA，縮放至 target_h 高。
    """
    orig = Image.open(orig_path).convert("RGBA")
    arr = np.array(orig, dtype=np.float32)

    R, G, B, A = arr[:,:,0], arr[:,:,1], arr[:,:,2], arr[:,:,3]

    # 深藍書法字：B 最大、R 和 G 明顯小於 B、整體偏暗
    blue_dom = (B > 60) & (B > R * 1.8) & (B > G * 1.5) & (B < 180)
    # 也抓較深的筆觸
    dark_blue = (R < 80) & (G < 80) & (B > 60) & (B > R + 30) & (B > G + 20)

    mask_bool = blue_dom | dark_blue

    # 填充遮罩強度（用 B channel 當筆跡濃淡）
    strength = np.clip((B - 40) / 130.0, 0, 1) * mask_bool.astype(np.float32)

    # 建立白色 RGBA（筆跡部分白色，其餘透明）
    out = np.zeros((*arr.shape[:2], 4), dtype=np.uint8)
    out[:,:,0] = 255  # R
    out[:,:,1] = 255  # G
    out[:,:,2] = 255  # B
    out[:,:,3] = (strength * 255).astype(np.uint8)

    img = Image.fromarray(out, "RGBA")

    # 裁切有效區域（去除空白邊緣）
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    # 去除底部「TAIWAN」小字（約佔裁切後高度的 20%）
    cut_h = int(img.height * 0.78)
    img = img.crop((0, 0, img.width, cut_h))

    # 再裁一次有效區域
    bbox2 = img.getbbox()
    if bbox2:
        img = img.crop(bbox2)

    # 縮放至目標高度
    ratio = target_h / img.height
    nw = int(img.width * ratio)
    img = img.resize((nw, target_h), Image.LANCZOS)
    return img


# ── 繪製鐵人三項小圖示 ───────────────────────────────────────
def draw_tri_icons(draw: ImageDraw.ImageDraw, cx: int, y: int,
                   size: int = 28, gap: int = 48, color=(255, 255, 255, 200)):
    """在 (cx, y) 為中心，畫 swim / bike / run 三個小圖示"""
    r, g, b, a = color
    fill = (r, g, b, a)
    lw = max(2, size // 14)

    def swim(ox, oy):
        # 頭部圓圈
        hr = size // 7
        draw.ellipse([(ox - hr, oy - hr), (ox + hr, oy + hr)], fill=fill)
        # 水面弧線（兩段鋸齒波浪）
        wy = oy + size // 4
        pts = []
        for i in range(5):
            wx = ox - size // 2 + i * (size // 4)
            pts.append((wx, wy - (size // 8 if i % 2 == 0 else 0)))
        for i in range(len(pts) - 1):
            draw.line([pts[i], pts[i+1]], fill=fill, width=lw)
        # 手臂延伸線
        draw.line([(ox, oy), (ox + size // 2, oy - size // 6)], fill=fill, width=lw)

    def bike(ox, oy):
        wr = size // 4
        # 兩個輪子
        lx = ox - size // 3
        rx = ox + size // 3
        wheel_y = oy + size // 6
        draw.ellipse([(lx - wr, wheel_y - wr), (lx + wr, wheel_y + wr)],
                     outline=fill, width=lw)
        draw.ellipse([(rx - wr, wheel_y - wr), (rx + wr, wheel_y + wr)],
                     outline=fill, width=lw)
        # 車架
        seat_x, seat_y = lx + size // 10, wheel_y - size // 3
        head_x, head_y = rx - size // 10, wheel_y - size // 4
        draw.line([(lx, wheel_y), (seat_x, seat_y)], fill=fill, width=lw)
        draw.line([(seat_x, seat_y), (rx, wheel_y)], fill=fill, width=lw)
        draw.line([(seat_x, seat_y), (head_x, head_y)], fill=fill, width=lw)
        draw.line([(head_x, head_y), (rx, wheel_y)], fill=fill, width=lw)
        # 頭盔/騎士頭
        hr2 = size // 9
        draw.ellipse([(head_x - hr2, head_y - size // 3 - hr2),
                      (head_x + hr2, head_y - size // 3 + hr2)], fill=fill)

    def run(ox, oy):
        # 頭部
        hr = size // 7
        draw.ellipse([(ox - hr, oy - size // 2 - hr),
                      (ox + hr, oy - size // 2 + hr)], fill=fill)
        # 身體
        draw.line([(ox, oy - size // 2 + hr), (ox, oy)], fill=fill, width=lw)
        # 腿（動態奔跑）
        draw.line([(ox, oy), (ox - size // 3, oy + size // 3)], fill=fill, width=lw)
        draw.line([(ox, oy), (ox + size // 4, oy + size // 3)], fill=fill, width=lw)
        # 手臂
        arm_y = oy - size // 4
        draw.line([(ox, arm_y), (ox - size // 3, arm_y - size // 6)], fill=fill, width=lw)
        draw.line([(ox, arm_y), (ox + size // 3, arm_y + size // 8)], fill=fill, width=lw)

    positions = [cx - gap, cx, cx + gap]
    funcs = [swim, bike, run]
    for pos, fn in zip(positions, funcs):
        fn(pos, y)


# ── 繪製中央文字 ──────────────────────────────────────────────
def draw_center(canvas: Image.Image):
    draw = ImageDraw.Draw(canvas)
    cx = W // 2

    # 鐵人三項圖示
    icon_y = H // 2 - 170
    draw_tri_icons(draw, cx, icon_y, size=30, gap=52,
                   color=(*WHITE, 190))

    sep_top = icon_y + 26

    # ── 書法「女力」──
    orig_path = BASE / "banner-female-power-original.png"
    callig_h = 320  # 書法字高度（放大）
    if orig_path.exists():
        callig = extract_calligraphy(orig_path, target_h=callig_h)
        # 確保不超出中央欄
        max_w = CENTER_W - 20
        if callig.width > max_w:
            ratio = max_w / callig.width
            callig = callig.resize((max_w, int(callig.height * ratio)), Image.LANCZOS)
            callig_h = callig.height

        cx_off = cx - callig.width // 2
        cy_off = sep_top + 10
        # 輕微金色光暈（陰影偏移）
        tinted = np.array(callig, dtype=np.float32)
        glow = tinted.copy()
        glow[:,:,0] = tinted[:,:,0] * (GOLD[0]/255)
        glow[:,:,1] = tinted[:,:,1] * (GOLD[1]/255)
        glow[:,:,2] = tinted[:,:,2] * (GOLD[2]/255)
        glow[:,:,3] = tinted[:,:,3] * 0.4
        glow_img = Image.fromarray(glow.astype(np.uint8), "RGBA")
        canvas.alpha_composite(glow_img, (cx_off + 4, cy_off + 4))
        # 主白色字
        canvas.alpha_composite(callig, (cx_off, cy_off))
        text_bottom = cy_off + callig_h
    else:
        # fallback: 字型渲染
        font_main = load_font(["kaiu.ttf", "msjhbd.ttc", "msjh.ttc"], 200)
        main_text = "女力"
        bbox = draw.textbbox((0, 0), main_text, font=font_main)
        tw2, th2 = bbox[2] - bbox[0], bbox[3] - bbox[1]
        tx = cx - tw2 // 2
        ty = sep_top + 10
        draw.text((tx + 3, ty + 3), main_text, font=font_main, fill=(*GOLD_DIM, 100))
        draw.text((tx, ty), main_text, font=font_main, fill=(*WHITE, 255))
        text_bottom = ty + th2

    # 副標題
    font_sub = load_font(["msjhbd.ttc", "msjh.ttc", "mingliu.ttc"], 18)
    sub_text = "台灣女子歷代超級鐵人三項 226KM 排行榜"
    bbox = draw.textbbox((0, 0), sub_text, font=font_sub)
    tw4 = bbox[2] - bbox[0]
    sub_y = text_bottom + 14
    draw.text((cx - tw4 // 2, sub_y), sub_text, font=font_sub, fill=(*WHITE, 230))

# ── 處理單側選手群（統一尺寸 5×2 格子）──────────────────────
def build_side(filenames: list, side: str) -> Image.Image:
    """
    5 欄 × 2 列網格，每格固定尺寸，不互蓋。
    side: 'left' or 'right'
    """
    panel = Image.new("RGBA", (SIDE_W, H), (0, 0, 0, 0))

    N_COLS = 5
    N_ROWS = 2
    CELL_W = SIDE_W // N_COLS          # 82px
    CELL_H = H // N_ROWS               # 230px

    # 最多用 N_COLS*N_ROWS 張，多的捨棄
    use_files = filenames[: N_COLS * N_ROWS]

    for idx, fname in enumerate(use_files):
        src = ATHLETES_DIR / fname
        if not src.exists():
            print(f"  [skip] {fname}")
            continue

        img = remove_bg(src)
        img = duotone(img)

        # 縮放：高度撐滿 CELL_H，再中央裁寬至 CELL_W
        scale = CELL_H / img.height
        nw = max(1, int(img.width * scale))
        img = img.resize((nw, CELL_H), Image.LANCZOS)
        if nw >= CELL_W:
            x0 = (nw - CELL_W) // 2
            img = img.crop((x0, 0, x0 + CELL_W, CELL_H))
        else:
            pad = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
            pad.alpha_composite(img, ((CELL_W - nw) // 2, 0))
            img = pad

        row = idx // N_COLS
        col = idx % N_COLS

        # 後排（row 0）稍微降低亮度
        if row == 0:
            arr = np.array(img, dtype=np.float32)
            arr[:, :, 3] = arr[:, :, 3] * 0.72
            img = Image.fromarray(arr.astype(np.uint8), "RGBA")

        # 右側：欄位從右往左排
        if side == "left":
            x = col * CELL_W
        else:
            x = SIDE_W - CELL_W - col * CELL_W

        y = row * CELL_H

        try:
            panel.alpha_composite(img, (x, y))
        except Exception as e:
            print(f"  [warn] {fname}: {e}")

    # 向中央漸淡
    panel = fade_mask(panel, direction="right" if side == "left" else "left", fade_px=110)
    return panel


# ── 主程式 ────────────────────────────────────────────────────
def main():
    print("=== 生成 Banner ===")

    print("[1/4] 建立背景...")
    canvas = make_bg(W, H)

    left_athletes, right_athletes = get_all_athletes()
    print(f"[2/4] 處理左側選手（{len(left_athletes)} 張）...")
    left_panel = build_side(left_athletes, "left")
    canvas.alpha_composite(left_panel, (0, 0))

    print(f"[3/4] 處理右側選手（{len(right_athletes)} 張）...")
    right_panel = build_side(right_athletes, "right")
    canvas.alpha_composite(right_panel, (W - SIDE_W, 0))

    print("[4/4] 繪製中央文字...")
    draw_center(canvas)

    out = canvas.convert("RGB")
    out.save(str(OUT_PATH), "PNG", optimize=True)
    print(f"\n完成！輸出：{OUT_PATH}")
    print(f"尺寸：{out.width} × {out.height}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
