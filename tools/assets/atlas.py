# Pack front/left/right impostor views into one 1024x512 palette PNG per building; widths proportional to metres.
import json, os, sys
from PIL import Image
d = sys.argv[1]
meta = json.load(open(os.path.join(d, 'meta.json')))
for name, m in meta.items():
    wf = m['max'][0] - m['min'][0]
    ws = m['zFront'] - m['min'][2]
    total = wf + 2 * ws
    W, H = 1024, 512
    xs = [0, round(W * wf / total), round(W * (wf + ws) / total), W]
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for i, k in enumerate(['front', 'left', 'right']):
        im = Image.open(os.path.join(d, f'{name}_{k}.png')).convert('RGBA').resize((xs[i + 1] - xs[i], H), Image.LANCZOS)
        atlas.paste(im, (xs[i], 0))
    atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(os.path.join(d, f'{name}_atlas.png'), optimize=True)
    m['u'] = [x / W for x in xs]
    print(name, m['u'], os.path.getsize(os.path.join(d, f'{name}_atlas.png')))
json.dump(meta, open(os.path.join(d, 'meta.json'), 'w'), indent=1)
