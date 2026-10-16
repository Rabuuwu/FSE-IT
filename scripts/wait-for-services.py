"""Bounded readiness polling for local CI servers."""
import time
from urllib.request import urlopen

for url in ['http://127.0.0.1:3000/ready', 'http://127.0.0.1:8000/health', 'http://127.0.0.1:5500/catalog.html']:
    deadline = time.monotonic() + 45
    while True:
        try:
            with urlopen(url, timeout=2) as response:
                if response.status == 200:
                    break
        except OSError:
            pass
        if time.monotonic() > deadline:
            raise SystemExit(f'Service did not become ready: {url}')
        time.sleep(.5)
