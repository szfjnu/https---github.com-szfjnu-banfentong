from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
from PIL import Image
import os

output_dir = os.path.dirname(os.path.abspath(__file__))

configs = [
    {
        'input': 'banfentong-logo-tech.svg',
        'output': 'banfentong-logo-tech.png',
        'width': 1024,
        'height': 1024
    },
    {
        'input': 'banfentong-logo-minimal.svg',
        'output': 'banfentong-logo-minimal.png',
        'width': 1024,
        'height': 1024
    },
    {
        'input': 'banfentong-logo-dark.svg',
        'output': 'banfentong-logo-dark.png',
        'width': 1024,
        'height': 1024
    },
    {
        'input': 'banfentong-logo-appicon.svg',
        'output': 'banfentong-logo-appicon.png',
        'width': 512,
        'height': 512
    }
]

print("开始转换SVG到PNG...")
print("-" * 50)

for config in configs:
    input_path = os.path.join(output_dir, config['input'])
    output_path = os.path.join(output_dir, config['output'])

    if not os.path.exists(input_path):
        print(f"❌ 文件不存在: {config['input']}")
        continue

    try:
        # 读取SVG并转换为ReportLab图形
        drawing = svg2rlg(input_path)

        # 计算缩放比例
        scale_x = config['width'] / drawing.width
        scale_y = config['height'] / drawing.height
        scale = min(scale_x, scale_y)

        drawing.width = config['width']
        drawing.height = config['height']
        drawing.scale(scale, scale)

        # 渲染为PNG
        renderPM.drawToFile(drawing, output_path, fmt='PNG')

        print(f"✅ {config['input']} → {config['output']} ({config['width']}x{config['height']})")
    except Exception as e:
        print(f"❌ 转换失败 {config['input']}: {str(e)}")

print("-" * 50)
print("转换完成！")
