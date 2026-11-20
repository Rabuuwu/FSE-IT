#!/usr/bin/env bash
# Dedicated temporary cluster. Never reads the project's DATABASE_URL or starts its regular DB.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local artifacts
TEST_ROOT=$(mktemp -d "$PWD/.local/product-test.XXXXXX")
PIDS=()
PG_STARTED=0
cleanup(){
 for pid in ${PIDS[@]+"${PIDS[@]}"}; do kill "$pid" 2>/dev/null || true; done
 for pid in ${PIDS[@]+"${PIDS[@]}"}; do wait "$pid" 2>/dev/null || true; done
 if [[ "$PG_STARTED" == 1 ]]; then pg_ctl -D "$TEST_ROOT/pg" -m fast -w stop; fi
}
trap cleanup EXIT
command -v initdb >/dev/null
command -v node >/dev/null
[[ -x .venv/bin/python ]] || { echo 'Missing .venv/bin/python; see docs/LOCAL_SETUP.md'; exit 1; }
# Check ports before starting; do not borrow or stop existing services.
python3 - <<'PY'
import socket
for port in (54369,3049,8049,5549):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',port))
PY
initdb -D "$TEST_ROOT/pg" -U fse_test -A trust --encoding=UTF8 --no-locale > "$TEST_ROOT/init.log"
pg_ctl -D "$TEST_ROOT/pg" -l "$TEST_ROOT/postgres.log" -o "-h 127.0.0.1 -p 54369 -k $TEST_ROOT" -w start
PG_STARTED=1
createdb -h 127.0.0.1 -p 54369 -U fse_test fse_product_test
createdb -h 127.0.0.1 -p 54369 -U fse_test fse_restore_test
export DATABASE_URL=postgresql://fse_test@127.0.0.1:54369/fse_product_test
export TEST_DATABASE_URL="$DATABASE_URL"
export TEST_RESTORE_DATABASE_URL=postgresql://fse_test@127.0.0.1:54369/fse_restore_test
export NODE_ENV=test DATABASE_SSL=false JWT_SECRET=isolated-product-test-secret-at-least-32 BCRYPT_SALT_ROUNDS=10
export GMAIL_CLIENT_ID='' GMAIL_CLIENT_SECRET='' GMAIL_REFRESH_TOKEN='' MAIL_FROM='' PUBLIC_APP_URL=''
export ML_SERVICE_TOKEN=isolated-product-ml-secret-at-least-32 ML_URL=http://127.0.0.1:8049 CORE_INTERNAL_URL=http://127.0.0.1:3049
export PORT=3049 CORS_ORIGINS=http://127.0.0.1:5549 FRONTEND_API_URL=http://127.0.0.1:3049
export E2E_FRONTEND_URL=http://127.0.0.1:5549 E2E_API_URL=http://127.0.0.1:3049
export E2E_ADMIN_EMAIL=admin@example.com E2E_ADMIN_PASSWORD=isolated-product-admin-password
npm test
npm run test:integration
npm run test:restore
npm run test:ml
npm run check
npm run migrate
npm run build
node scripts/create-ci-admin.js
node coreFSE.js > "$TEST_ROOT/core.log" 2>&1 & PIDS+=("$!")
.venv/bin/python -m uvicorn ml.app:app --host 127.0.0.1 --port 8049 > "$TEST_ROOT/ml.log" 2>&1 & PIDS+=("$!")
.venv/bin/python -m http.server 5549 --bind 127.0.0.1 --directory dist > "$TEST_ROOT/frontend.log" 2>&1 & PIDS+=("$!")
python3 - <<'PY'
import time
import urllib.request
for url in ('http://127.0.0.1:3049/ready','http://127.0.0.1:8049/health','http://127.0.0.1:5549/login.html'):
    for attempt in range(60):
        try:
            with urllib.request.urlopen(url,timeout=2) as response:
                if response.status == 200: break
        except OSError: pass
        time.sleep(.5)
    else: raise SystemExit('Test service failed to start: '+url)
PY
.venv/bin/python tests/e2e.py
.venv/bin/python tests/learning_e2e.py
echo "PASS: full product verification. Local logs: $TEST_ROOT"
