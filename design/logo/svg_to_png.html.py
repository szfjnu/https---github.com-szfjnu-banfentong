import os
from PIL import Image
import base64

output_dir = os.path.dirname(os.path.abspath(__file__))

configs = [
    {'input': 'banfentong-logo-tech.svg', 'output': 'banfentong-logo-tech.png', 'width': 1024, 'height': 1024},
    {'input': 'banfentong-logo-minimal.svg', 'output': 'banfentong-logo-minimal.png', 'width': 1024, 'height': 1024},
    {'input': 'banfentong-logo-dark.svg', 'output': 'banfentong-logo-dark.png', 'width': 1024, 'height': 1024},
    {'input': 'banfentong-logo-appicon.svg', 'output': 'banfentong-logo-appicon.png', 'width': 512, 'height': 512}
]

print("开始转换SVG到PNG（使用HTML渲染方式）...")
print("-" * 50)

for config in configs:
    input_path = os.path.join(output_dir, config['input'])
    output_path = os.path.join(output_dir, config['output'])

    if not os.path.exists(input_path):
        print(f"❌ 文件不存在: {config['input']}")
        continue

    try:
        # 读取SVG内容
        with open(input_path, 'r', encoding='utf-8') as f:
            svg_content = f.read()

        # 创建HTML文件用于渲染
        html_content = f'''<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body {{ margin: 0; padding: 0; background: transparent; }}
svg {{ display: block; }}
</style>
</head>
<body>
{svg_content}
</body>
</html>'''

        html_path = output_path.replace('.png', '.html')
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        print(f"✅ 已生成HTML渲染文件: {os.path.basename(html_path)}")
        print(f"   请用浏览器打开此文件，截图保存为PNG")

    except Exception as e:
        print(f"❌ 处理失败 {config['input']}: {str(e)}")

print("-" * 50)
print("说明：由于环境缺少SVG渲染库，已生成HTML文件")
print("请用Chrome浏览器打开HTML文件，按F12调整尺寸后截图")
print("或使用在线转换工具: https://convertio.co/zh/svg-png/")
