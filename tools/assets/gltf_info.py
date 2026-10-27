# Summarise glTF characters: tris, height, materials/images, skin joints (hand bones), animation names.
import json, os, sys
for f in sys.argv[1:]:
    g = json.load(open(f))
    tris = 0; mn = [1e9]*3; mx = [-1e9]*3
    for m in g.get('meshes', []):
        for p in m['primitives']:
            a = g['accessors'][p['attributes']['POSITION']]
            tris += (g['accessors'][p['indices']]['count'] if 'indices' in p else a['count']) // 3
            for k in range(3): mn[k] = min(mn[k], a['min'][k]); mx[k] = max(mx[k], a['max'][k])
    joints = []
    for s in g.get('skins', []): joints += [g['nodes'][j].get('name', '') for j in s['joints']]
    hands = [j for j in joints if any(t in j.lower() for t in ('hand', 'wrist', 'fist', 'palm'))]
    anims = [a.get('name', '?') for a in g.get('animations', [])]
    imgs = [i.get('uri', i.get('mimeType', ''))[:40] for i in g.get('images', [])]
    print(f"{os.path.basename(f)}: tris={tris} size={[round(mx[k]-mn[k],2) for k in range(3)]} mats={len(g.get('materials',[]))} imgs={imgs} joints={len(joints)} hands={hands}")
    print(f"   anims({len(anims)}): {', '.join(anims)}")
