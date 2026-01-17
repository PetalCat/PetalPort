import { fail } from '@sveltejs/kit';
import { getProxies, saveProxies, type ProxyRule } from '$lib/server/frp';
import { getAgents } from '$lib/server/agents';
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
        const bindPort = parseInt(data.get('bindPort') as string);
        const type = data.get('type') as 'tcp' | 'udp';
        const agentId = data.get('agentId') as string;

        if (!name || !bindPort || !type || !agentId) {
            return fail(400, { missing: true });
        }

        const proxies = await getProxies();

        if (proxies.some(p => p.bindPort === bindPort)) {
            return fail(400, { error: 'Port already in use' });
        }

        const newProxy: ProxyRule = {
            id: randomUUID(),
            name,
            type,
            bindPort,
            agentId
        };

        proxies.push(newProxy);
        await saveProxies(proxies);

        return { success: true };
    },

    delete: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id') as string;

        let proxies = await getProxies();
        proxies = proxies.filter(p => p.id !== id);
        await saveProxies(proxies);

        return { success: true };
    }
};
