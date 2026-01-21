import { fail } from '@sveltejs/kit';
import { getProxies, saveProxies, type ProxyRule } from '$lib/server/frp';
import { getAgents } from '$lib/server/agents';
import { allowPort, denyPort } from '$lib/server/firewall';
import { randomUUID } from 'node:crypto';

// Reserved/system ports that shouldn't be used
const RESERVED_PORTS = new Set([
    22,    // SSH
    53,    // DNS
    80,    // HTTP (might be used by web server)
    443,   // HTTPS/WireGuard
    7000,  // FRP server
    7400,  // FRP admin
    7500,  // FRP dashboard
    8456,  // PetalPort panel
]);

// Validate port number
function validatePort(port: number, fieldName: string): string | null {
    if (isNaN(port) || port < 1 || port > 65535) {
        return `${fieldName} must be between 1 and 65535`;
    }
    if (port < 1024 && RESERVED_PORTS.has(port)) {
        return `${fieldName} ${port} is reserved for system services`;
    }
    return null;
}

// Validate tunnel name
function validateName(name: string): string | null {
    if (!name || name.length < 1) {
        return 'Name is required';
    }
    if (name.length > 64) {
        return 'Name must be 64 characters or less';
    }
    // Only allow alphanumeric, dash, underscore, space
    if (!/^[a-zA-Z0-9_\- ]+$/.test(name)) {
        return 'Name can only contain letters, numbers, dashes, underscores, and spaces';
    }
    return null;
}

export const load = async () => {
    const proxies = await getProxies();
    const agents = await getAgents();

    // Enrich proxies with UDP forward status from agents
    const enrichedProxies = proxies.map(proxy => {
        if (proxy.type !== 'udp') return proxy;

        const agent = agents.find(a => a.id === proxy.agentId);
        if (!agent?.udpForwards) return proxy;

        // Find matching UDP forward status
        const udpStatus = agent.udpForwards.find(
            f => f.localPort === proxy.localPort && f.listenPort === proxy.localPort
        );

        return {
            ...proxy,
            udpStatus: udpStatus ? {
                active: udpStatus.active,
                error: udpStatus.error
            } : undefined
        };
    });

    return {
        proxies: enrichedProxies,
        agents,
        serverAddr: process.env.SERVER_ADDR || 'vpn.example.com'
    };
};

// Parse service address like "10.10.10.4:25565" or just "25565"
function parseServiceAddress(address: string): { ip: string; port: number } | null {
    const trimmed = address.trim();

    // Check if it's just a port number
    if (/^\d+$/.test(trimmed)) {
        const port = parseInt(trimmed);
        if (port >= 1 && port <= 65535) {
            return { ip: '127.0.0.1', port };
        }
        return null;
    }

    // Check for ip:port format
    const match = trimmed.match(/^([\d.]+|localhost):(\d+)$/);
    if (match) {
        const ip = match[1] === 'localhost' ? '127.0.0.1' : match[1];
        const port = parseInt(match[2]);
        if (port >= 1 && port <= 65535) {
            // Basic IP validation
            if (ip === '127.0.0.1' || /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
                return { ip, port };
            }
        }
    }

    return null;
}

export const actions = {
    create: async ({ request }) => {
        const data = await request.formData();
        const name = (data.get('name') as string || '').trim();
        const localAddress = (data.get('localAddress') as string || '').trim();
        const bindPort = parseInt(data.get('bindPort') as string);
        const type = data.get('type') as 'tcp' | 'udp';
        const agentId = data.get('agentId') as string;

        // Parse service address
        const parsedAddress = parseServiceAddress(localAddress);
        if (!parsedAddress) {
            return fail(400, { error: 'Invalid service address. Use format: 127.0.0.1:25565 or just 25565' });
        }

        const { ip: localIp, port: localPort } = parsedAddress;

        // Validate required fields
        if (!name || !bindPort || !type || !agentId) {
            return fail(400, { error: 'All fields are required' });
        }

        // Validate name
        const nameError = validateName(name);
        if (nameError) {
            return fail(400, { error: nameError });
        }

        // Validate type
        if (type !== 'tcp' && type !== 'udp') {
            return fail(400, { error: 'Type must be tcp or udp' });
        }

        // Validate ports
        const localPortError = validatePort(localPort, 'Local port');
        if (localPortError) {
            return fail(400, { error: localPortError });
        }

        const bindPortError = validatePort(bindPort, 'Remote port');
        if (bindPortError) {
            return fail(400, { error: bindPortError });
        }

        // Check for reserved server ports
        if (RESERVED_PORTS.has(bindPort)) {
            return fail(400, { error: `Remote port ${bindPort} is reserved for system services` });
        }

        // Validate local IP (basic check)
        if (localIp && !/^(\d{1,3}\.){3}\d{1,3}$/.test(localIp) && localIp !== 'localhost') {
            return fail(400, { error: 'Invalid local IP address format' });
        }

        let proxies = await getProxies();

        // Check for bind port conflicts (same port, same protocol)
        const portConflict = proxies.find(p => p.bindPort === bindPort && p.type === type);
        if (portConflict) {
            return fail(400, { error: `Port ${bindPort}/${type} is already used by "${portConflict.name}"` });
        }

        // Check for name duplicates
        if (proxies.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            return fail(400, { error: `A tunnel named "${name}" already exists` });
        }

        // Verify agent exists
        const agents = await getAgents();
        if (!agents.some(a => a.id === agentId)) {
            return fail(400, { error: 'Selected agent does not exist' });
        }

        const newProxy: ProxyRule = {
            id: randomUUID(),
            name,
            type,
            localIp: localIp || '127.0.0.1',
            localPort,
            bindPort,
            agentId
        };

        proxies.push(newProxy);
        await saveProxies(proxies);

        // Open firewall port with correct protocol
        try {
            await allowPort(bindPort, `FRP: ${name}`, type);
        } catch (e: any) {
            console.error('Firewall failed:', e);
            // Revert changes
            proxies = proxies.filter(p => p.id !== newProxy.id);
            await saveProxies(proxies);
            return fail(500, { error: `Firewall failed: ${e.message}` });
        }

        return { success: true };
    },

    delete: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id') as string;

        let proxies = await getProxies();
        const toDelete = proxies.find(p => p.id === id);

        if (toDelete) {
            // Close firewall port with correct protocol
            await denyPort(toDelete.bindPort, toDelete.type);
        }

        proxies = proxies.filter(p => p.id !== id);
        await saveProxies(proxies);

        return { success: true };
    },

    migrate: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id') as string;
        const agentId = data.get('agentId') as string;

        if (!id || !agentId) {
            return fail(400, { missing: true });
        }

        // Import migrateProxy dynamically or move it to top imports
        const { migrateProxy } = await import('$lib/server/frp');
        const success = await migrateProxy(id, agentId);

        if (!success) {
            return fail(404, { error: 'Tunnel not found' });
        }

        return { success: true };
    },

    edit: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id') as string;
        const name = (data.get('name') as string || '').trim();
        const localAddress = (data.get('localAddress') as string || '').trim();
        const bindPort = parseInt(data.get('bindPort') as string);

        if (!id) {
            return fail(400, { error: 'Tunnel ID is required' });
        }

        // Parse service address
        const parsedAddress = parseServiceAddress(localAddress);
        if (!parsedAddress) {
            return fail(400, { error: 'Invalid service address. Use format: 127.0.0.1:25565 or just 25565' });
        }

        const { ip: localIp, port: localPort } = parsedAddress;

        // Validate name
        const nameError = validateName(name);
        if (nameError) {
            return fail(400, { error: nameError });
        }

        // Validate ports
        const localPortError = validatePort(localPort, 'Local port');
        if (localPortError) {
            return fail(400, { error: localPortError });
        }

        const bindPortError = validatePort(bindPort, 'Remote port');
        if (bindPortError) {
            return fail(400, { error: bindPortError });
        }

        // Check for reserved server ports
        if (RESERVED_PORTS.has(bindPort)) {
            return fail(400, { error: `Remote port ${bindPort} is reserved for system services` });
        }

        let proxies = await getProxies();
        const existingIndex = proxies.findIndex(p => p.id === id);

        if (existingIndex === -1) {
            return fail(404, { error: 'Tunnel not found' });
        }

        const existing = proxies[existingIndex];

        // Check for bind port conflicts (same port, same protocol, different tunnel)
        const portConflict = proxies.find(p => p.bindPort === bindPort && p.type === existing.type && p.id !== id);
        if (portConflict) {
            return fail(400, { error: `Port ${bindPort}/${existing.type} is already used by "${portConflict.name}"` });
        }

        // Check for name duplicates (different tunnel)
        if (proxies.some(p => p.name.toLowerCase() === name.toLowerCase() && p.id !== id)) {
            return fail(400, { error: `A tunnel named "${name}" already exists` });
        }

        const oldBindPort = existing.bindPort;
        const portChanged = oldBindPort !== bindPort;

        // Update the proxy
        proxies[existingIndex] = {
            ...existing,
            name,
            localIp,
            localPort,
            bindPort
        };

        await saveProxies(proxies);

        // Update firewall if port changed
        if (portChanged) {
            try {
                await denyPort(oldBindPort, existing.type);
                await allowPort(bindPort, `FRP: ${name}`, existing.type);
            } catch (e: any) {
                console.error('Firewall update failed:', e);
                // Revert changes
                proxies[existingIndex] = existing;
                await saveProxies(proxies);
                return fail(500, { error: `Firewall update failed: ${e.message}` });
            }
        }

        return { success: true };
    }
};
