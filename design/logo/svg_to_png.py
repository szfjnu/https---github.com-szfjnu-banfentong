import cairosvg
import os

# 确保输出目录存在
output_dir = os.path.dirname(os.path.abspath(__file__))

# 定义转换配置
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
        cairosvg.svg2png(
            url=input_path,
            write_to=output_path,
            output_width=config['width'],
            output_height=config['height']
        )
        print(f"✅ {config['input']} → {config['output']} ({config['width']}x{config['height']})")
    except Exception as e:
        print(f"❌ 转换失败 {config['input']}: {str(e)}")

print("-" * 50)
print("转换完成！")
