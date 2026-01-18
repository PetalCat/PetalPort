import fs from 'node:fs/promises';
import path from 'node:path';
import { restartContainer } from './docker';
import { allowPort, denyPort } from './firewall';

import { env } from '$env/dynamic/private';

const CONFIG_ROOT = env.CONFIG_ROOT || '/config';
const CONFIG_DIR = path.join(CONFIG_ROOT, 'frp');
const PROXIES_FILE = path.join(CONFIG_DIR, 'proxies.json');
const FRPS_CONF_FILE = path.join(CONFIG_DIR, 'frps.toml');

export interface ProxyRule {
    id: string;
    name: string;
    type: 'tcp' | 'udp';
    localIp: string;     // IP on the agent to forward from (usually 127.0.0.1)
    localPort: number;   // Port on the agent to forward from
    bindPort: number;    // Port on the server to expose
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

import { randomBytes } from 'node:crypto';

export const syncConfig = async (proxies: ProxyRule[]) => {
    console.log('[FRP] Generating frps.toml...');

    const dashboardUser = env.FRP_DASHBOARD_USER || 'admin';
    const dashboardPassword = env.FRP_DASHBOARD_PASSWORD || randomBytes(16).toString('hex');

    if (!env.FRP_DASHBOARD_PASSWORD) {
        console.log('====================================================');
        console.log(`[FRP] Generated Secure Dashboard Password: ${dashboardPassword}`);
        console.log('====================================================');
    }

    // Explicitly bind to IPv4 0.0.0.0 to avoid IPv6-only binding issues
    let config = `bindAddr = "0.0.0.0"
    bindPort = 7000

# Dashboard
webServer.addr = "0.0.0.0"
webServer.port = 7500
webServer.user = "${dashboardUser}"
webServer.password = "${dashboardPassword}"


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

    await fs.writeFile(FRPS_CONF_FILE, config, { mode: 0o600 });
    await restartContainer('petalport-frps');
};

export const generateAgentConfig = async (agentId: string, serverAddr: string, serverPort: number, token?: string): Promise<string> => {
    const proxies = await getProxies();
    const agentProxies = proxies.filter(p => p.agentId === agentId);

    // Check if we need to include "common" section (always yes)
    let config = `[common]
server_addr = ${serverAddr}
server_port = ${serverPort}
admin_addr = 127.0.0.1
admin_port = 7400
`;

    if (token) {
        config += `token = ${token}\n`;
    }

    config += '\n';

    for (const p of agentProxies) {
        config += `[${p.name}]
type = ${p.type}
local_ip = ${p.localIp || '127.0.0.1'}
local_port = ${p.localPort}
remote_port = ${p.bindPort}

`;
    }

    return config;
};

export const deleteProxiesForAgent = async (agentId: string) => {
    let proxies = await getProxies();
    const agentProxies = proxies.filter(p => p.agentId === agentId);

    // Clean up firewalls
    for (const p of agentProxies) {
        try {
            await denyPort(p.bindPort);
        } catch (e) {
            console.error(`Failed to close port ${p.bindPort}:`, e);
        }
    }

    // Remove from list
    proxies = proxies.filter(p => p.agentId !== agentId);
    await saveProxies(proxies);
};

export const migrateProxy = async (proxyId: string, targetAgentId: string) => {
    const proxies = await getProxies();
    const proxy = proxies.find(p => p.id === proxyId);
    if (!proxy) return false;

    const oldAgentId = proxy.agentId;
    proxy.agentId = targetAgentId;

    await saveProxies(proxies);

    // Notify both old and new agents
    if (oldAgentId) emitToAgent(oldAgentId, 'config_updated', { timestamp: Date.now() });
    emitToAgent(targetAgentId, 'config_updated', { timestamp: Date.now() });

    return true;
};
