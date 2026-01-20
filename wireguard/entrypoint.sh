#!/bin/bash
set -e

CONFIG_FILE="/config/wg_confs/wg0.conf"

echo "[WireGuard] Waiting for config file..."

# Wait for config to be created by panel (max 60 seconds)
TRIES=0
while [ ! -f "$CONFIG_FILE" ]; do
    sleep 2
    TRIES=$((TRIES + 1))
    if [ $TRIES -ge 30 ]; then
        echo "[WireGuard] ERROR: Config not found after 60 seconds. Exiting."
        exit 1
    fi
    echo "[WireGuard] Waiting for $CONFIG_FILE... ($TRIES/30)"
done

echo "[WireGuard] Config found, starting WireGuard..."

# Create symlink so wg-quick can find the config
mkdir -p /etc/wireguard
ln -sf "$CONFIG_FILE" /etc/wireguard/wg0.conf

# Bring down existing interface if it exists (from previous container run)
if ip link show wg0 &>/dev/null; then
    echo "[WireGuard] wg0 already exists, bringing it down first..."
    wg-quick down wg0 || true
fi

# Start WireGuard
wg-quick up wg0

echo "[WireGuard] Running. Keeping container alive..."

# Keep container running, handle SIGTERM gracefully
trap "wg-quick down wg0; exit 0" SIGTERM SIGINT

# Stay alive
while true; do
    sleep 60
done
