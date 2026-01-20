import { error, json } from '@sveltejs/kit';
import { validateAgentToken } from '$lib/server/agents';
import { getProxies } from '$lib/server/frp';
import type { RequestHandler } from './$types';

/**
 * Returns UDP proxy forwarding rules for the agent.
 * The agent uses these to set up iptables DNAT rules to forward
 * traffic from its WireGuard interface to local services.
 */
export const GET: RequestHandler = async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw error(401, 'Unauthorized');
    }

    const token = authHeader.split(' ')[1];
    const agent = await validateAgentToken(token);

    if (!agent) {
        throw error(401, 'Unauthorized');
    }

    const proxies = await getProxies();

    // Filter to only UDP proxies for this agent
    const udpForwards = proxies
        .filter(p => p.type === 'udp' && p.agentId === agent.id)
        .map(p => ({
            name: p.name,
            localIp: p.localIp || '127.0.0.1',
            localPort: p.localPort,
            listenPort: p.localPort // Port to listen on WG interface
        }));

    return json({ forwards: udpForwards });
};
