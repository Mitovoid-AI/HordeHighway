# Downscale Downtown kit textures for mobile: JPEG 512 (decals: PNG 1024 with alpha).
import os, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for name in sorted(os.listdir(src)):
    if not name.endswith('.png'):
        continue
    im = Image.open(os.path.join(src, name))
    base = name[:-4]
    if base == 'T_Street_Decals':
        im.convert('RGBA').resize((1024, 1024), Image.LANCZOS).save(os.path.join(dst, base + '.png'), optimize=True)
    else:
        im.convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(dst, base + '.jpg'), quality=85, optimize=True)
    print(name)
