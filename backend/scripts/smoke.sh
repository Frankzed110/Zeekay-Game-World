#!/usr/bin/env bash
# curl smoke suite against a running API: ./scripts/smoke.sh [http://localhost:8001]
set -euo pipefail
API="${1:-http://localhost:8001}"
KEY="smoke-$(date +%s)-0001"
j() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
echo "health:      $(curl -fsS "$API/health" | j 'd["status"]')"
echo "register:    $(curl -fsS -X POST "$API/api/players/register" -H 'Content-Type: application/json' -d "{\"player_key\":\"$KEY\",\"display_name\":\"Smoke\"}" | j 'd["player"]["display_name"]')"
curl -fsS -X POST "$API/api/save" -H 'Content-Type: application/json' -d "{\"player_key\":\"$KEY\",\"payload\":{\"version\":1,\"profile\":{\"level\":3}},\"updated_at\":\"2026-01-01T00:00:00Z\"}" >/dev/null
echo "save pull:   $(curl -fsS "$API/api/save/$KEY" | j 'd["found"] and d["payload"]["profile"]["level"]')"
echo "score rank:  $(curl -fsS -X POST "$API/api/scores" -H 'Content-Type: application/json' -d "{\"player_key\":\"$KEY\",\"display_name\":\"Smoke\",\"mode\":\"arena_duel\",\"score\":1234}" | j 'd["rank"]')"
echo "leaderboard: $(curl -fsS "$API/api/leaderboard?mode=arena_duel" | j 'len(d["entries"])') entries"
echo "champions:   $(curl -fsS "$API/api/champions?player_key=$KEY" | j 'd["me"]["by_mode"]["arena_duel"]')"
echo "validation:  HTTP $(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/scores" -H 'Content-Type: application/json' -d '{"player_key":"x","mode":"arena_duel","score":-1}') (expect 422)"
