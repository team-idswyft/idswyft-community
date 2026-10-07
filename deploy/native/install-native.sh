#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

APP_DIR=/opt/testagram-identity
CONFIG_DIR=/etc/testagram-identity
REPO_URL=${REPO_URL:-https://github.com/Trendyzima/idswyft-community.git}
BRANCH=${BRANCH:-main}

apt-get update
apt-get install -y git nginx postgresql postgresql-contrib ca-certificates curl build-essential python3

if ! command -v node >/dev/null 2>&1 || [[ $(node -p "process.versions.node.split('.')[0]") -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

id -u testagram-id >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/testagram-id --shell /usr/sbin/nologin testagram-id
install -d -o testagram-id -g testagram-id "$APP_DIR" "$CONFIG_DIR"

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
fi

chown -R testagram-id:testagram-id "$APP_DIR"
runuser -u testagram-id -- bash -lc "cd '$APP_DIR' && npm ci && npm run build"
install -d -o testagram-id -g testagram-id "$APP_DIR/backend/uploads" "$APP_DIR/backend/temp"

if [[ ! -f "$CONFIG_DIR/backend.env" ]]; then
  install -m 600 -o root -g root "$APP_DIR/deploy/native/backend.env.example" "$CONFIG_DIR/backend.env"
  echo "Edit $CONFIG_DIR/backend.env before starting the API."
fi
if [[ ! -f "$CONFIG_DIR/engine.env" ]]; then
  install -m 600 -o root -g root "$APP_DIR/deploy/native/engine.env.example" "$CONFIG_DIR/engine.env"
  echo "Edit $CONFIG_DIR/engine.env before starting the engine."
fi

install -m 644 "$APP_DIR/deploy/native/testagram-identity-api.service" /etc/systemd/system/testagram-identity-api.service
install -m 644 "$APP_DIR/deploy/native/testagram-identity-engine.service" /etc/systemd/system/testagram-identity-engine.service
install -m 644 "$APP_DIR/deploy/native/testagram-identity-nginx.conf" /etc/nginx/sites-available/testagram-identity.conf
ln -sf /etc/nginx/sites-available/testagram-identity.conf /etc/nginx/sites-enabled/testagram-identity.conf
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
nginx -t
echo "Native identity software installed. Configure PostgreSQL + env files, run migrations, then enable services."
