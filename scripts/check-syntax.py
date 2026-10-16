"""Use NODE_BINARY to select a runtime when node is not on PATH."""
from pathlib import Path
import json
import os
import py_compile
import re
import subprocess
import tempfile
from html.parser import HTMLParser

root = Path(__file__).resolve().parent.parent
node = os.environ.get('NODE_BINARY', 'node')
count = 0
for path in root.rglob('*.js'):
    if any(part in {'node_modules', 'dist', '.venv', '.git'} for part in path.parts):
        continue
    subprocess.run([node, '--check', str(path)], check=True)
    count += 1
for path in root.glob('*.html'):
    for source in re.findall(r'<script\b[^>]*>(.*?)</script>', path.read_text(), re.S):
        if not source.strip():
            continue
        with tempfile.NamedTemporaryFile(suffix='.js', mode='w') as temp:
            temp.write(source)
            temp.flush()
            subprocess.run([node, '--check', temp.name], check=True)
        count += 1
for directory in ['ml','tests','scripts']:
    for path in (root/directory).glob('*.py'):
        py_compile.compile(str(path), doraise=True)
json.loads((root/'package.json').read_text())

class AssetParser(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        source = attrs.get('src') if tag == 'script' else attrs.get('href') if tag == 'link' else None
        if source and not source.startswith(('http:', 'https:')):
            assert (root/source).is_file(), f'Missing browser asset: {source}'
for path in root.glob('*.html'):
    AssetParser().feed(path.read_text())
print(f'PASS: {count} JavaScript sources, Python compilation, package JSON and local HTML assets')
