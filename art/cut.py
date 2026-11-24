"""相棒の表情の3枚組を、1人ずつ切り分けて背景を透明にする。

使い方: python art/cut.py
art/raw の元絵から img/hom/<モチーフ>_<0|1|2>.webp を作る（0=左, 1=中, 2=右）。
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'art' / 'raw'
OUT = ROOT / 'img' / 'hom'
H = 384  # 出力の高さ（スマホの2倍表示でも足りる大きさ）

SRC = {
    'pebble': 'Character_expression_sheet_of_girl_58c965ad.jpg',
    'sprout': 'Character_expressions_sheet_with…_bf686a39.jpg',
    'mist': '30e4fe86.jpg',
    'copper': 'Boy_character_expression_sheet_3c5f30be.jpg',
    'primrose': 'Character_expression_sheet_of_girl_43b50581.jpg',
    'ammonite': 'Boy_expressions_sheet_a4adc195.jpg',
}


def bg_alpha(rgb):
    """縁につながる白っぽい所を背景とみなし、なめらかな透明度を返す。"""
    h, w, _ = rgb.shape
    white = rgb.min(axis=2).astype(int)
    spread = rgb.max(axis=2).astype(int) - white
    near = (white > 225) & (spread < 30)
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    # 背景に接する1画素ぶんは、白さに応じて半透明にして縁のギザギザを消す
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    edge = np.zeros_like(bg)
    edge[1:, :] |= bg[:-1, :]; edge[:-1, :] |= bg[1:, :]
    edge[:, 1:] |= bg[:, :-1]; edge[:, :-1] |= bg[:, 1:]
    edge &= ~bg
    soft = np.clip((255 - white) * 255 // 60, 0, 255).astype(np.uint8)
    alpha[edge] = np.minimum(alpha[edge], soft[edge])
    return alpha


def split3(alpha):
    """不透明な列のかたまりを3つ見つけて、左右の範囲を返す。"""
    cols = (alpha > 0).sum(axis=0) > 0
    runs, start = [], None
    for x, c in enumerate(cols):
        if c and start is None:
            start = x
        if not c and start is not None:
            runs.append([start, x]); start = None
    if start is not None:
        runs.append([start, len(cols)])
    # 小さなかけら（z の吹き出しなど）は、近いかたまりにまとめる
    while len(runs) > 3:
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        i = gaps.index(min(gaps))
        runs[i:i + 2] = [[runs[i][0], runs[i + 1][1]]]
    if len(runs) < 3:
        # 絵どうしがくっついているときは、1/3・2/3 の近くで一番すいている列で切る
        cnt = (alpha > 0).sum(axis=0)
        w = len(cnt)
        cuts = [int(np.argmin(cnt[c - 60:c + 60])) + c - 60 for c in (w // 3, w * 2 // 3)]
        x0 = runs[0][0]; x1 = runs[-1][1]
        runs = [[x0, cuts[0]], [cuts[0], cuts[1]], [cuts[1], x1]]
    return runs


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for key, name in SRC.items():
        im = Image.open(RAW / name).convert('RGB')
        rgb = np.asarray(im)
        alpha = bg_alpha(rgb)
        rgba = np.dstack([rgb, alpha])
        # 3枚の大きさをそろえるため、上下は3枚共通の範囲で切る
        rows = np.where((alpha > 0).any(axis=1))[0]
        y0, y1 = rows[0], rows[-1] + 1
        for i, (x0, x1) in enumerate(split3(alpha)):
            part = Image.fromarray(rgba[y0:y1, x0:x1])
            w = round(part.width * H / part.height)
            part = part.resize((w, H), Image.LANCZOS)
            part.save(OUT / f'{key}_{i}.webp', quality=88, method=6)
            print(key, i, part.size)


if __name__ == '__main__':
    main()
