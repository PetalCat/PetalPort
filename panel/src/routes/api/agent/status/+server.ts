import { json, error } from '@sveltejs/kit';
import { validateAgentToken, updateAgentStatus, type UdpForwardStatus } from '$lib/server/agents';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw error(401, 'Unauthorized');
    }

    const token = authHeader.split(' ')[1];
    const agent = await validateAgentToken(token);

    if (!agent) {
        throw error(401, 'Unauthorized');
    }

    try {
        const body = await request.json();
        const { status, meta, stats, wgStatus, udpForwards } = body;

        await updateAgentStatus(
            agent.id,
            status || 'online',
            meta,
            stats,
            wgStatus as 'up' | 'down' | 'unknown' | undefined,
            udpForwards as UdpForwardStatus[] | undefined
        );

        return json({ success: true });
    } catch (e) {
        console.error('Status update error:', e);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
