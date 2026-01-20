import { fail } from '@sveltejs/kit';
import { getProxies, saveProxies, type ProxyRule } from '$lib/server/frp';
import { getAgents } from '$lib/server/agents';
import { allowPort, denyPort } from '$lib/server/firewall';
import { randomUUID } from 'node:crypto';

export const load = async () => {
    const proxies = await getProxies();
    const agents = await getAgents();
    return {
        proxies,
        agents,
        serverAddr: process.env.SERVER_ADDR || 'vpn.example.com'
    };
};

export const actions = {
    create: async ({ request }) => {
        const data = await request.formData();
        const name = data.get('name') as string;
        const localPort = parseInt(data.get('localPort') as string);
        const bindPort = parseInt(data.get('bindPort') as string);
        const type = data.get('type') as 'tcp' | 'udp';
        const agentId = data.get('agentId') as string;

        if (!name || !localPort || !bindPort || !type || !agentId) {
            return fail(400, { missing: true });
        }

        let proxies = await getProxies();

        if (proxies.some(p => p.bindPort === bindPort)) {
            return fail(400, { error: 'Port already in use' });
        }

        const newProxy: ProxyRule = {
            id: randomUUID(),
            name,
            type,
            localIp: '127.0.0.1',  // Default to localhost on agent
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
    }
};
