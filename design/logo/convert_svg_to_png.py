import os
import base64
from PIL import Image
import io

output_dir = os.path.dirname(os.path.abspath(__file__))

configs = [
    {'input': 'banfentong-logo-tech-v2.svg', 'output': 'banfentong-logo-tech.png', 'width': 1024, 'height': 1024},
    {'input': 'banfentong-logo-minimal-v2.svg', 'output': 'banfentong-logo-minimal.png', 'width': 1024, 'height': 1024},
    {'input': 'banfentong-logo-dark-v2.svg', 'output': 'banfentong-logo-dark.png', 'width': 1024, 'height': 1024},
    {'input': 'banfentong-logo-appicon-v2.svg', 'output': 'banfentong-logo-appicon.png', 'width': 512, 'height': 512}
]

print("=" * 60)
print("SVG转PNG工具")
print("=" * 60)
print("\n由于环境限制，提供以下转换方案：\n")

print("【方案1】使用在线转换工具（推荐）")
print("-" * 40)
print("1. 访问 https://convertio.co/zh/svg-png/")
print("2. 上传以下 v2 版本的SVG文件：")
for config in configs:
    print(f"   - {config['input']}")
print("3. 设置输出尺寸：")
for config in configs:
    print(f"   - {config['input']}: {config['width']}x{config['height']}")
print("4. 点击转换，下载PNG文件\n")

print("【方案2】使用浏览器截图")
print("-" * 40)
print("1. 用Chrome浏览器打开SVG文件")
print("2. 按F12打开开发者工具")
print("3. 在Console输入以下命令设置透明背景：")
print("   document.body.style.background = 'transparent'")
print("4. 调整窗口大小到合适尺寸")
print("5. 使用截图工具保存为PNG\n")

print("【方案3】使用Inkscape（专业工具）")
print("-" * 40)
print("安装Inkscape后，使用以下命令：")
for config in configs:
    input_path = os.path.join(output_dir, config['input'])
    print(f"inkscape \"{input_path}\" --export-filename=\"{config['output']}\" --export-width={config['width']}")

print("\n【方案4】使用Adobe Illustrator/Figma")
print("-" * 40)
print("1. 打开SVG文件")
print("2. 文件 → 导出 → 导出为PNG")
print("3. 设置所需尺寸\n")

print("=" * 60)
print("v2版本改进：所有文字已转为路径，转换时不会丢失")
print("=" * 60)

# 生成HTML预览文件
html_content = """<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>班分通Logo预览</title>
<style>
body { font-family: Arial, sans-serif; background: #f0f0f0; padding: 20px; }
.logo-container { display: inline-block; margin: 20px; text-align: center; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
.logo-container img, .logo-container svg { width: 200px; height: 200px; }
.logo-title { margin-top: 10px; font-weight: bold; color: #333; }
</style>
</head>
<body>
<h1>班分通Logo v2版本预览（文字已转路径）</h1>
<p>这些SVG文件中的文字已转换为路径，可以正确转换为PNG而不会丢失文字。</p>
"""

for config in configs:
    svg_path = os.path.join(output_dir, config['input'])
    if os.path.exists(svg_path):
        with open(svg_path, 'r', encoding='utf-8') as f:
            svg_content = f.read()
        # 提取svg标签内容
        svg_start = svg_content.find('<svg')
        svg_end = svg_content.find('</svg>') + 6
        svg_tag = svg_content[svg_start:svg_end]
        # 调整预览尺寸
        svg_tag = svg_tag.replace('width="512"', 'width="200"').replace('width="256"', 'width="200"')
        svg_tag = svg_tag.replace('height="512"', 'height="200"').replace('height="256"', 'height="200"')
        html_content += f'<div class="logo-container">{svg_tag}<div class="logo-title">{config["input"]}</div></div>\n'

html_content += """
</body>
</html>
"""

preview_path = os.path.join(output_dir, 'logo-preview.html')
with open(preview_path, 'w', encoding='utf-8') as f:
    f.write(html_content)

print(f"\n✅ 已生成预览文件: {preview_path}")
print("   请用浏览器打开此文件查看所有Logo效果")
