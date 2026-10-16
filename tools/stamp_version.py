"""Gắn ?v=<phiên bản> vào mọi đường dẫn file JS/CSS nội bộ để điện thoại không dùng bản cũ trong cache.
Chạy trước mỗi lần đẩy lên GitHub:  python3 tools/stamp_version.py"""
import pathlib
import re
import time

root = pathlib.Path(__file__).resolve().parent.parent
ver = time.strftime('%Y%m%d%H%M%S')

# import ... from './x.js'  (trong src/)
imp = re.compile(r"""(from\s+['"]\./[\w-]+\.js)(\?v=\w+)?(['"])""")
for f in sorted((root / 'src').glob('*.js')):
    s = f.read_text(encoding='utf-8')
    n = imp.sub(lambda m: f'{m.group(1)}?v={ver}{m.group(3)}', s)
    if n != s:
        f.write_text(n, encoding='utf-8')

# index.html: styles.css và src/main.js
html = root / 'index.html'
s = html.read_text(encoding='utf-8')
s = re.sub(r'(href="styles\.css)(\?v=\w+)?(")', rf'\g<1>?v={ver}\3', s)
s = re.sub(r'(src="src/main\.js)(\?v=\w+)?(")', rf'\g<1>?v={ver}\3', s)
html.write_text(s, encoding='utf-8')
print('version', ver)
