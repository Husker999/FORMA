"""
Prepares a copy of the page for publishing as a claude.ai artifact.
The artifact host wraps the page in its own <html>/<head>/<body>, so this strips
those tags from index.html and writes dist/artifact.html. Everything else
(css, js, vendor, assets) is published unchanged next to it.

Usage: python3 tools/build_artifact.py
Prints the list of supporting files to publish.
"""
import os, re, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()

out = src
for pat in [r'<!doctype html>\s*', r'<html[^>]*>\s*', r'</html>\s*', r'<head>\s*', r'</head>\s*', r'<body>\s*', r'</body>\s*',
            r'<meta charset="utf-8">\s*', r'<meta name="viewport"[^>]*>\s*']:
    out = re.sub(pat, '', out, count=1, flags=re.I)

# The artifact host doesn't serve .glb, so the model ships as a JS module with base64 data.
import base64
out = out.replace('data-hero-canvas>', 'data-hero-canvas data-model-module="dist/car-concept-model.js">', 1)
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
glb = open(os.path.join(ROOT, 'assets', 'models', 'car-concept.glb'), 'rb').read()
with open(os.path.join(ROOT, 'dist', 'car-concept-model.js'), 'w') as f:
    f.write('// Car Concept (CC BY 4.0, Eric Chadwick / Darmstadt Graphics Group), packed .glb as base64\n')
    f.write('export default "' + base64.b64encode(glb).decode('ascii') + '";\n')
# Inline the stylesheet with both fonts as data: URIs (the artifact host's documented-safe way to ship fonts).
css = open(os.path.join(ROOT, 'css', 'styles.css'), encoding='utf-8').read()
for fn in ['RobotoFlex-subset.woff', 'GolosText-subset.woff']:
    data = base64.b64encode(open(os.path.join(ROOT, 'assets', 'fonts', fn), 'rb').read()).decode('ascii')
    css = css.replace('url("../assets/fonts/' + fn + '")', 'url("data:font/woff;base64,' + data + '")')
css = css.replace('url("../', 'url("')
out = re.sub(r'<link rel="preload" href="assets/fonts/[^"]+" as="font" type="font/woff" crossorigin>\s*', '', out)
out = out.replace('<link rel="stylesheet" href="css/styles.css">', '<style>\n' + css + '\n</style>', 1)
with open(os.path.join(ROOT, 'dist', 'artifact.html'), 'w', encoding='utf-8') as f:
    f.write(out)

files = {}
for folder in ['css', 'js', 'vendor', 'assets']:
    if folder == 'css':
        continue
    for dp, _, fns in os.walk(os.path.join(ROOT, folder)):
        for fn in fns:
            if fn.endswith(('.txt', '.md', '.glb', '.woff')) or fn.startswith('.') or fn == 'LICENSE':
                continue
            rel = os.path.relpath(os.path.join(dp, fn), ROOT)
            files[rel] = rel
files['dist/car-concept-model.js'] = 'dist/car-concept-model.js'
total = sum(os.path.getsize(os.path.join(ROOT, p)) for p in files)
print(json.dumps(files, indent=1))
print(f'{len(files)} files, {total / 1e6:.2f} MB')
