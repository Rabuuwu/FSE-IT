#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PORT="${PORT:-3000}"
if [[ ! "$API_PORT" =~ ^[0-9]+$ ]] || (( API_PORT < 1024 || API_PORT > 65535 )); then
  echo "PORT musi być liczbą od 1024 do 65535." >&2
  exit 1
fi
API_URL="http://127.0.0.1:$API_PORT"
export PORT="$API_PORT" FRONTEND_API_URL="$API_URL"

if [[ ! -f .env ]]; then
  echo "Brak .env. Skopiuj .env.example do .env i ustaw lokalne sekrety." >&2
  exit 1
fi
if [[ ! -x .venv/bin/python ]]; then
  echo "Brak .venv. Utwórz środowisko ML i zainstaluj requirements z docs/LOCAL_SETUP.md." >&2
  exit 1
fi

python3 - <<'PY'
from pathlib import Path

values = {}
for line in Path('.env').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
for key in ('JWT_SECRET', 'ML_SERVICE_TOKEN'):
    if len(values.get(key, '')) < 32:
        raise SystemExit(f'{key} w .env musi mieć co najmniej 32 znaki.')
PY

if ! .venv/bin/python -m uvicorn --version >/dev/null 2>&1; then
  echo "Brak uvicorn w .venv. Zainstaluj zależności ML z docs/LOCAL_SETUP.md." >&2
  exit 1
fi

LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fse-it-dev.XXXXXX")"
touch "$LOG_DIR/ml.log" "$LOG_DIR/api.log" "$LOG_DIR/frontend.log"
PIDS=("")
TEMP_PG_STARTED=0
TAIL_PID=""

cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$TAIL_PID" ]]; then kill "$TAIL_PID" 2>/dev/null || true; fi
  for pid in "${PIDS[@]}"; do
    [[ -n "$pid" ]] && kill -TERM "$pid" 2>/dev/null || true
  done
  for pid in "${PIDS[@]}"; do
    [[ -n "$pid" ]] && wait "$pid" 2>/dev/null || true
  done
  if [[ "$TEMP_PG_STARTED" == 1 ]]; then
    "$PG_CTL" -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
  fi
  echo "Zatrzymano procesy uruchomione przez launcher. Logi: $LOG_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

BREW_PREFIX="$(brew --prefix)"
PG_CTL="$(brew --prefix postgresql@17)/bin/pg_ctl"
PG_ISREADY="$(brew --prefix postgresql@17)/bin/pg_isready"
PGDATA="$BREW_PREFIX/var/postgresql@17"
if [[ ! -x "$PG_ISREADY" || ! -x "$PG_CTL" ]]; then
  echo "Nie znaleziono PostgreSQL 17 z Homebrew." >&2
  exit 1
fi

if ! "$PG_ISREADY" -h 127.0.0.1 -p 5432 -q; then
  if lsof -nP -iTCP:5432 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port 5432 jest zajęty, ale PostgreSQL nie odpowiada poprawnie. Nie uruchamiam drugiej instancji." >&2
    exit 1
  fi
  if ! "$PG_CTL" -D "$PGDATA" status >/dev/null 2>&1; then
    "$PG_CTL" -D "$PGDATA" -l "$LOG_DIR/postgres.log" start
    TEMP_PG_STARTED=1
  fi
  for _ in $(seq 1 30); do
    "$PG_ISREADY" -h 127.0.0.1 -p 5432 -q && break
    sleep 1
  done
fi
if ! "$PG_ISREADY" -h 127.0.0.1 -p 5432 -q; then
  echo "PostgreSQL nie odpowiada na 127.0.0.1:5432. Szczegóły: $LOG_DIR/postgres.log" >&2
  exit 1
fi

echo "Sprawdzam migracje i buduję frontend..."
npm run migrate
npm run migration:report
npm run build

wait_for_service() {
  local name="$1" url="$2" pid="$3" logfile="$4"
  for _ in $(seq 1 45); do
    if curl --silent --show-error --fail --max-time 2 "$url" >/dev/null 2>&1; then
      echo "$name gotowy: $url"
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$name zakończył się podczas startu. Ostatnie logi:" >&2
      tail -n 60 "$logfile" >&2 || true
      return 1
    fi
    sleep 1
  done
  echo "$name nie zgłosił gotowości. Ostatnie logi:" >&2
  tail -n 60 "$logfile" >&2 || true
  return 1
}

start_service() {
  local name="$1" port="$2" url="$3"; shift 3
  local logfile="$LOG_DIR/$name.log" pid
  if curl --silent --fail --max-time 2 "$url" >/dev/null 2>&1; then
    echo "$name już działa: $url (zostawiam bez zmian)"
    return 0
  fi
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port jest zajęty, ale $name nie odpowiada pod $url. Zatrzymaj usługę na tym porcie i ponów npm run dev." >&2
    return 1
  fi
  "$@" >"$logfile" 2>&1 &
  pid=$!
  PIDS+=("$pid")
  wait_for_service "$name" "$url" "$pid" "$logfile"
}

ML_SERVICE_TOKEN="$(python3 - <<'PY'
from pathlib import Path
for line in Path('.env').read_text().splitlines():
    if line.startswith('ML_SERVICE_TOKEN='):
        print(line.split('=', 1)[1].strip().strip('"').strip("'"))
        break
PY
)"
export ML_SERVICE_TOKEN CORE_INTERNAL_URL="$API_URL"

start_service "ml" 8000 "http://127.0.0.1:8000/health" \
  .venv/bin/python -m uvicorn ml.app:app --host 127.0.0.1 --port 8000 --reload --reload-dir ml
start_service "api" "$API_PORT" "$API_URL/ready" node --watch coreFSE.js
start_service "frontend" 5500 "http://127.0.0.1:5500/" \
  python3 -m http.server 5500 --bind 127.0.0.1 --directory dist

echo
echo "FSE-IT działa: http://127.0.0.1:5500"
echo "API: $API_URL | ML: http://127.0.0.1:8000"
echo "API i ML uruchomione przez launcher przeładowują zmiany automatycznie. Frontend przebuduj przez npm run build."
echo "Ctrl+C zatrzymuje tylko procesy uruchomione przez ten launcher; istniejące usługi pozostają uruchomione."
echo "Logi zapisuję w: $LOG_DIR"
tail -n +1 -f "$LOG_DIR"/*.log &
TAIL_PID=$!
wait "$TAIL_PID"
