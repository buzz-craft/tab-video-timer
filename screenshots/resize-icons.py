from PIL import Image
import os

src = Image.open('/home/user/tab-video-timer/screenshots/icon-raw-256.png').convert('RGBA')

sizes = {
    128: '/home/user/tab-video-timer/icon128.png',
    48:  '/home/user/tab-video-timer/icon48.png',
    16:  '/home/user/tab-video-timer/icon16.png',
    # store icon — 24-bit PNG no alpha (white bg)
    'store': '/home/user/tab-video-timer/screenshots/store-icon-128.png',
}

for size, path in sizes.items():
    if size == 'store':
        img = src.resize((128, 128), Image.LANCZOS)
        bg = Image.new('RGB', (128, 128), (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        bg.save(path, 'PNG')
        print(f'✓ {path} (128x128 RGB no alpha)')
    else:
        img = src.resize((size, size), Image.LANCZOS)
        img.save(path, 'PNG')
        print(f'✓ {path} ({size}x{size} RGBA)')
