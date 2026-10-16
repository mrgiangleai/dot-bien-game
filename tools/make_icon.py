"""Vẽ icon app (1024x1024 PNG): đầu đột biến xanh có gai + tâm ngắm vàng."""
import math
import sys
from PIL import Image, ImageDraw, ImageFilter

S = 1024
out = sys.argv[1] if len(sys.argv) > 1 else 'icon.png'

img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

# nền bo góc, gradient xanh trời -> xanh đêm
bg = Image.new('RGBA', (S, S))
top, bot = (98, 160, 214), (27, 36, 51)
for y in range(S):
    t = y / (S - 1)
    c = tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(3)) + (255,)
    ImageDraw.Draw(bg).line([(0, y), (S, y)], fill=c)
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([40, 40, S - 40, S - 40], radius=200, fill=255)
img.paste(bg, (0, 0), mask)

d = ImageDraw.Draw(img)
cx, cy = S // 2, S // 2 + 40

# gai trên đầu
for i in range(7):
    a = math.radians(-75 + i * 25)
    bx, by = cx + math.sin(a) * 250, cy - math.cos(a) * 250
    tx, ty = cx + math.sin(a) * 400, cy - math.cos(a) * 400
    px, py = math.cos(a) * 55, math.sin(a) * 55
    d.polygon([(bx - px, by - py), (bx + px, by + py), (tx, ty)], fill=(155, 106, 58))

# đầu xanh
d.ellipse([cx - 270, cy - 270, cx + 270, cy + 270], fill=(143, 191, 85))
d.ellipse([cx - 270, cy - 270, cx + 270, cy + 270], outline=(95, 125, 52), width=16)
# mắt đỏ phát sáng
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for ex in (cx - 110, cx + 110):
    gd.ellipse([ex - 70, cy - 90, ex + 70, cy + 50], fill=(255, 60, 40, 200))
img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(28)))
for ex in (cx - 110, cx + 110):
    d.rounded_rectangle([ex - 38, cy - 70, ex + 38, cy + 30], radius=14, fill=(255, 58, 42))
# miệng
d.rounded_rectangle([cx - 120, cy + 110, cx + 120, cy + 150], radius=20, fill=(60, 80, 34))

# tâm ngắm vàng
y = (242, 193, 78)
r = 360
d.ellipse([cx - r, cy - r - 40, cx + r, cy + r - 40], outline=y, width=26)
ccy = cy - 40
for (x0, y0, x1, y1) in [(cx, ccy - r - 70, cx, ccy - r + 80), (cx, ccy + r - 80, cx, ccy + r + 70),
                         (cx - r - 70, ccy, cx - r + 80, ccy), (cx + r - 80, ccy, cx + r + 70, ccy)]:
    d.line([(x0, y0), (x1, y1)], fill=y, width=30)

img.save(out)
print('saved', out)
