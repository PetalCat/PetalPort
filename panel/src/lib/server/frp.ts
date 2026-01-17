import fs from 'node:fs/promises';
import path from 'node:path';
import { restartContainer } from './docker';

import { env } from '$env/dynamic/private';

const CONFIG_ROOT = env.CONFIG_ROOT || '/config';
const CONFIG_DIR = path.join(CONFIG_ROOT, 'frp');
const PROXIES_FILE = path.join(CONFIG_DIR, 'proxies.json');
const FRPS_CONF_FILE = path.join(CONFIG_DIR, 'frps.toml');

export interface ProxyRule {
    id: string;
    name: string;
    type: 'tcp' | 'udp';
    bindPort: number;
    description?: string;
    token?: string; // Optional per-proxy token
    agentId?: string; // ID of the agent running this tunnel
}

export const getProxies = async (): Promise<ProxyRule[]> => {
    try {
        const data = await fs.readFile(PROXIES_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

import { emitToAgent } from './sse';

export const saveProxies = async (proxies: ProxyRule[]) => {
    await fs.writeFile(PROXIES_FILE, JSON.stringify(proxies, null, 2));
    await syncConfig(proxies); // Used for Server config (allowPorts if needed, or just static)

    // Notify agents that config has changed
    // We can optimize to only notify affected agents, or just broadcast to all if simpler for now.
    // Iterating to identify unique agentIds is better.
    const agentIds = new Set(proxies.map(p => p.agentId).filter(Boolean));
    for (const agentId of agentIds) {
        emitToAgent(agentId!, 'config_updated', { timestamp: Date.now() });
    }
};

export const syncConfig = async (proxies: ProxyRule[]) => {
    let config = `bindPort = 7000
    
# Auth (optional, global token)
# auth.method = "token"
# auth.token = "SECRET_TOKEN"

# Dashboard
webServer.addr = "0.0.0.0"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "admin"


`;

    // FRP server config usually defines allowed ports, but per-proxy config is client-side driven unless we use "allowPorts".
    // Actually, frps.toml configures the SERVER. Clients (frpc) request ports.
    // We can't strictly "define" tunnels in frps.toml except for static ones or plugins.
    // BUT we can use "allowPorts" to restrict what clients can request.

    // If we want to simple expose ports, we might just let clients request any port, 
    // OR we can generate client configs (frpc.ini) for the user to download.
    // The prompt says "Generate and manage FRP config files".
    // This likely means generating `frpc.ini` for the AGENT.
    // The server config `frps.toml` is mostly static.

    // So: This function should probably generate `frpc.ini` for a specific agent?
    // Or maybe we want to restrict ports on the server?

    // Let's assume for now we just maintain the list of "allocated" ports in our JSON
    // and maybe write a comment in frps.toml or update allowPorts if we want security.

    const allowedPorts = proxies.map(p => p.bindPort).join(',');
    // config += `allowPorts = [${allowedPorts}]\n`; 
    // (Syntax depends on frps version, toml usually uses arrays)

    await fs.writeFile(FRPS_CONF_FILE, config);
    // await restartContainer('petalport-frps');
};

export const generateAgentConfig = async (agentId: string, serverAddr: string, serverPort: number, token?: string): Promise<string> => {
    const proxies = await getProxies();
    const agentProxies = proxies.filter(p => p.agentId === agentId);

    // Check if we need to include "common" section (always yes)
    let config = `[common]
server_addr = ${serverAddr}
server_port = ${serverPort}
`;

    if (token) {
        config += `token = ${token}\n`;
    }

    config += '\n';

    for (const p of agentProxies) {
        config += `[${p.name}]
type = ${p.type}
local_ip = 127.0.0.1
local_port = 80
remote_port = ${p.bindPort}

`;
    }

    return config;
};
