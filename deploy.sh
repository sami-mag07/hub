#!/usr/bin/env bash
#
# Deploy von The Hub auf den eigenen VPS, nach dem Muster der NTA-App.
#
# Gebaut wird auf dem Mac (der VPS hat neben Emil nicht den Speicher für
# npm ci und vite). Nach oben gehen nur dist/ und server/ plus Dockerfile.
# Die Schlüssel stehen ausschließlich in /opt/hub/.env auf dem Server
# (Rechte 600) und kommen erst beim docker run hinein. Dieses Skript fasst
# sie nicht an.
#
#   ./deploy.sh            bauen, hochladen, Container tauschen, Gegenprobe

set -euo pipefail

VPS=root@5.45.109.195
ZIEL=/opt/hub
PORT=8340
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL=https://hub.5.45.109.195.sslip.io

cd "$HIER"

echo "==> 1/5  Tests"
npm test >/dev/null

echo "==> 2/5  Frontend bauen"
npm run build >/dev/null

echo "==> 3/5  dist/, server/, Dockerfile hochladen"
ssh "$VPS" "mkdir -p $ZIEL/data && test -f $ZIEL/.env || { echo 'FEHLT: $ZIEL/.env auf dem Server (siehe .env.example)'; exit 1; }"
# -rlptD statt -a: ohne -o/-g fasst rsync den Eigentümer nicht an.
rsync -rlptD --delete --exclude '.DS_Store' dist/ "$VPS:$ZIEL/dist/"
rsync -rlptD --delete --exclude '.DS_Store' server/ "$VPS:$ZIEL/server/"
rsync -lpt Dockerfile .dockerignore "$VPS:$ZIEL/"

echo "==> 4/5  Image bauen und Container tauschen"
# data/ gehört dem Container-Nutzer node (UID 1000) und hängt als Bind-Mount.
ssh "$VPS" "cd $ZIEL \
  && chown -R 1000:1000 $ZIEL/data \
  && docker build -q -t hub:latest . \
  && (docker rm -f hub >/dev/null 2>&1 || true) \
  && docker run -d --name hub --restart unless-stopped \
    --env-file $ZIEL/.env \
    -e VERTRAUE_PROXY=1 -e PORT=$PORT -e HUB_DATA_DIR=/app/data \
    --memory=192m \
    -v $ZIEL/data:/app/data \
    -p 127.0.0.1:$PORT:$PORT \
    hub:latest >/dev/null"

echo "==> 5/5  Gegenprobe"
sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/" --max-time 20)
echo "    Startseite : $code"
api=$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/session" --max-time 20)
echo "    API        : $api (401 ist richtig, niemand angemeldet)"
ssh "$VPS" "docker logs --tail 5 hub 2>&1 | sed 's/^/    /'"

echo
echo "Fertig: $URL"
echo "Rollback: ssh $VPS 'docker run ... hub:<vorheriges Image>' oder deploy.sh vom letzten Commit."
