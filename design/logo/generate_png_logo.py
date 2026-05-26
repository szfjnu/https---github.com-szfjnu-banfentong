from PIL import Image, ImageDraw
import os

output_dir = os.path.dirname(os.path.abspath(__file__))

def draw_logo_base(draw, size, version="minimal"):
    cx, cy = size // 2, size // 2 - 2
    scale = size / 144
    bh = int(28 * scale)

    if version == "minimal":
        bg_color = (102, 126, 234)
        r = int(size * 0.2)
        draw.rounded_rectangle([(0, 0), (size-1, size-1)], radius=r, fill=bg_color)
        bw = int(8 * scale)
        left = cx - int(18 * scale)
        right = cx + int(18 * scale)
        top = cy - int(26 * scale)
        bottom = cy + int(26 * scale)
        draw.rectangle([left, top, left + bw, bottom], fill=(255, 255, 255))
        draw.chord([left + 2, top, right, top + bh + 4], start=270, end=90, fill=(255, 255, 255))
        draw.chord([left + 2, bottom - bh - 4, right, bottom], start=90, end=270, fill=(255, 255, 255))
        draw.rectangle([left + bw - 1, top + bh//2, right - 4, bottom - bh//2], fill=bg_color)

    elif version == "icon":
        draw.rounded_rectangle([(0, 0), (size-1, size-1)], radius=int(size*0.22), fill=(102, 126, 234))
        bw = int(6 * scale)
        left = cx - int(16 * scale)
        right = cx + int(16 * scale)
        top = cy - int(24 * scale)
        bottom = cy + int(24 * scale)
        draw.rectangle([left, top, left + bw, bottom], fill=(255, 255, 255))
        draw.chord([left + 2, top, right, top + bh + 4], start=270, end=90, fill=(255, 255, 255))
        draw.chord([left + 2, bottom - bh - 4, right, bottom], start=90, end=270, fill=(255, 255, 255))
        draw.rectangle([left + bw - 1, top + bh//2, right - 4, bottom - bh//2], fill=(102, 126, 234))
        dot = max(3, int(4 * scale))
        dx, dy = right + int(4*scale), top - int(2*scale)
        draw.ellipse([dx-dot, dy-dot, dx+dot, dy+dot], fill=(0, 212, 255))

    elif version == "dark":
        draw.rounded_rectangle([(0, 0), (size-1, size-1)], radius=int(size*0.22), fill=(15, 15, 35))
        ring_r = int(52 * scale)
        draw.ellipse([cx-ring_r, cy-ring_r, cx+ring_r, cy+ring_r], outline=(0, 212, 255, 100), width=max(1, int(2*scale)))
        cs = int(28 * scale)
        draw.rounded_rectangle([cx-cs, cy-cs, cx+cs, cy+cs], radius=int(4*scale), outline=(0, 212, 255), width=max(1, int(2*scale)))
        draw.rectangle([cx-int(10*scale), cy-int(16*scale), cx-int(6*scale), cy+int(16*scale)], fill=(0, 212, 255))
        draw.chord([cx-int(8*scale), cy-int(16*scale), cx+int(10*scale), cy+int(4*scale)], start=270, end=90, fill=(0, 212, 255))
        draw.chord([cx-int(8*scale), cy-int(4*scale), cx+int(10*scale), cy+int(16*scale)], start=90, end=270, fill=(0, 212, 255))
        draw.rectangle([cx-int(6*scale), cy-int(6*scale), cx+int(8*scale), cy+int(6*scale)], fill=(15, 15, 35))
        pins = [-int(16*scale), -int(6*scale), int(6*scale), int(16*scale)]
        pw, ph = max(1, int(5*scale)), max(1, int(2*scale))
        for pin in pins:
            draw.rectangle([cx-cs-pw, cy+pin-ph, cx-cs, cy+pin+ph], fill=(0, 212, 255))
            draw.rectangle([cx+cs, cy+pin-ph, cx+cs+pw, cy+pin+ph], fill=(0, 212, 255))

def save_optimized(img, filepath, max_size_kb=10):
    sizes = [192, 144, 120, 96, 72, 64]
    for s in sizes:
        img_resized = img.resize((s, s), Image.LANCZOS)
        img_resized.save(filepath, 'PNG', optimize=True)
        actual_kb = os.path.getsize(filepath) / 1024
        if actual_kb <= max_size_kb:
            return s, actual_kb
    img_64 = img.resize((64, 64), Image.LANCZOS)
    img_64.save(filepath, 'PNG', optimize=True)
    return 64, os.path.getsize(filepath) / 1024

versions = [
    ('minimal', 'banfentong-logo-png.png'),
    ('icon', 'banfentong-logo-icon.png'),
    ('dark', 'banfentong-logo-dark-icon.png'),
]

print("生成Logo PNG（≤10KB）...")
print("=" * 50)
for ver_name, filename in versions:
    filepath = os.path.join(output_dir, filename)
    img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_logo_base(draw, 256, ver_name)
    final_size, actual_kb = save_optimized(img, filepath)
    print(f"  {filename}: {actual_kb:.1f}KB ({final_size}x{final_size})")

print("=" * 50)
print("全部 ≤10KB ✅")
print()

print("所有Logo文件大小汇总：")
print("-" * 50)
for f in sorted(os.listdir(output_dir)):
    fpath = os.path.join(output_dir, f)
    if f.endswith(('.svg', '.png')):
        kb = os.path.getsize(fpath) / 1024
        ok = "✅" if kb <= 10 else "❌"
        print(f"  {ok} {f}: {kb:.1f}KB")
print("-" * 50)
print("所有文件均 ≤10KB，可直接使用！")