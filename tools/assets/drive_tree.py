import re, sys, html, json, subprocess
UA = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36'
def listing(fid):
    t = subprocess.run(['curl', '-sSL', '-A', UA, '--max-time', '40', f'https://drive.google.com/embeddedfolderview?id={fid}'], capture_output=True, text=True).stdout
    out = []
    for m in re.finditer(r'<a href="([^"]+)"[^>]*>.*?<div class="flip-entry-title">([^<]+)</div>', t, re.S):
        url, name = html.unescape(m.group(1)), html.unescape(m.group(2))
        f = re.search(r'/folders/([\w-]+)', url); d = re.search(r'/file/d/([\w-]+)', url)
        out.append(('dir', name, f.group(1)) if f else ('file', name, d.group(1) if d else url))
    return out
def walk(fid, path, res, depth=0):
    for kind, name, ident in listing(fid):
        p = f'{path}/{name}'
        if kind == 'dir':
            if depth < 4: walk(ident, p, res, depth + 1)
        else: res.append({'path': p, 'id': ident})
res = []
walk(sys.argv[1], sys.argv[2], res)
json.dump(res, open(sys.argv[3], 'w'), indent=0)
print(len(res), 'files')
