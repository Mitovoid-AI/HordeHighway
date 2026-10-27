import json, sys, os, subprocess
UA = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36'
out = sys.argv[2]; ok = fail = 0
for x in json.load(open(sys.argv[1])):
    p = x['path']
    if not ('/glTF/' in p or p.endswith(('.png', 'License.txt'))): continue
    dst = os.path.join(out, p); os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst) and os.path.getsize(dst) > 0: ok += 1; continue
    r = subprocess.run(['curl', '-sSL', '-A', UA, '--max-time', '180', '-o', dst,
        f"https://drive.usercontent.google.com/download?id={x['id']}&export=download&confirm=t"], capture_output=True)
    head = open(dst, 'rb').read(64) if os.path.exists(dst) else b''
    if r.returncode or head.lstrip().startswith(b'<!DOCTYPE') or head.lstrip().startswith(b'<html'):
        fail += 1; print('FAIL', p)
    else: ok += 1
print('ok', ok, 'fail', fail)
