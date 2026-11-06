#!/usr/bin/env python3
"""מעדכן מספר גרסה בכתובות הקבצים ב-index.html כדי שדפדפנים לא יטענו קוד ישן מהמטמון.
הרצה מתיקיית הריפו: python3 tools/stamp-version.py
"""
import hashlib, json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
html_p = root / 'index.html'
files = sorted(root.glob('js/*.js')) + [root / 'css/style.css']
h = hashlib.sha1()
for f in files:
    h.update(f.name.encode()); h.update(f.read_bytes())
ver = h.hexdigest()[:8]

imports = {
    'three': './vendor/three/build/three.module.js',
    'three/addons/': './vendor/three/examples/jsm/',
}
for f in sorted(root.glob('js/*.js')):
    rel = f'./js/{f.name}'
    imports[rel] = f'{rel}?v={ver}'
imap = json.dumps({'imports': imports}, indent=1, ensure_ascii=False)

html = html_p.read_text(encoding='utf-8')
html, n1 = re.subn(r'<script type="importmap">.*?</script>', f'<script type="importmap">\n{imap}\n</script>', html, flags=re.S)
html, n2 = re.subn(r'href="css/style\.css(\?v=[^"]*)?"', f'href="css/style.css?v={ver}"', html)
html, n3 = re.subn(r'src="js/main\.js(\?v=[^"]*)?"', f'src="js/main.js?v={ver}"', html)
html, n4 = re.subn(r'<meta name="app-version" content="[^"]*">', f'<meta name="app-version" content="{ver}">', html)
if not n4:
    html = html.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n<meta name="app-version" content="{ver}">', 1)
assert n1 == 1 and n2 == 1 and n3 == 1, (n1, n2, n3)
html_p.write_text(html, encoding='utf-8')
print(ver)
