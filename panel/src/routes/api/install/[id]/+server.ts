import { getProxies } from '$lib/server/frp';
import { getSettings } from '$lib/server/settings';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
    const { id } = params;
    const proxies = await getProxies();
    const proxy = proxies.find(p => p.id === id);
    const settings = await getSettings();

    if (!proxy) {
        return new Response('Proxy not found', { status: 404 });
    }

    const serverAddr = settings.serverEndpoint.split(':')[0]; // Remove port if present (defaults 51820)
    // Actually settings.serverEndpoint is for WireGuard (usually includes port).
    // FRP server defaults to port 7000? settings.frpServerPort is 7000.
    // Use settings.serverEndpoint hostname.

    // We need just the hostname for FRP.
    const host = serverAddr;

    const authTokenConfig = settings.frpAuthToken
        ? `token = ${settings.frpAuthToken}`
        : '';

    const script = `#!/bin/bash
set -e

# Configuration
FRP_VERSION="0.54.0"
PROXY_NAME="${proxy.name}"
PROXY_TYPE="${proxy.type}"
REMOTE_PORT="${proxy.bindPort}"
SERVER_ADDR="${host}"
SERVER_PORT="${settings.frpServerPort}"
AUTH_TOKEN="${settings.frpAuthToken || ''}"

echo "Installing Agent for $PROXY_NAME..."

# Detect Arch
ARCH="amd64"
if [[ $(uname -m) == "aarch64" ]]; then
    ARCH="arm64"
fi

# Download FRP
echo "Downloading frpc..."
cd /tmp
wget -q "https://github.com/fatedier/frp/releases/download/v\${FRP_VERSION}/frp_\${FRP_VERSION}_linux_\${ARCH}.tar.gz"
tar xzf "frp_\${FRP_VERSION}_linux_\${ARCH}.tar.gz"
cd "frp_\${FRP_VERSION}_linux_\${ARCH}"
mv frpc /usr/local/bin/

# Create Config
mkdir -p /etc/frp
cat <<EOF > /etc/frp/frpc-${id}.ini
[common]
server_addr = \${SERVER_ADDR}
server_port = \${SERVER_PORT}
${authTokenConfig}

[\${PROXY_NAME}]
type = \${PROXY_TYPE}
local_ip = 127.0.0.1
local_port = 80
remote_port = \${REMOTE_PORT}
EOF

echo "Created config at /etc/frp/frpc-${id}.ini"
echo "NOTE: specific local_port (80) is set. Edit configuration if your service runs on a different port."

# Systemd Service
cat <<EOF > /etc/systemd/system/petalport-${id}.service
[Unit]
Description=PetalPort Agent - \${PROXY_NAME}
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/frpc -c /etc/frp/frpc-${id}.ini
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

# Enable and Start
systemctl daemon-reload
systemctl enable petalport-${id}
systemctl restart petalport-${id}

echo "Agent installed and running!"
systemctl status petalport-${id} --no-pager
`;

    return new Response(script, {
        headers: {
            'Content-Type': 'text/x-shellscript'
        }
    });
};
