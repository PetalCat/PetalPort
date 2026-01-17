import { json } from '@sveltejs/kit';
import { redeemEnrollmentKey } from '$lib/server/agents';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { enrollKey, meta } = body;

        if (!enrollKey) {
            return json({ error: 'Missing enrollment key' }, { status: 400 });
        }

        const agent = await redeemEnrollmentKey(enrollKey, meta);

        if (!agent) {
            return json({ error: 'Invalid or expired enrollment key' }, { status: 401 });
        }

        return json({
            token: agent.token,
            agentId: agent.id,
            name: agent.name
        });
    } catch (e) {
        console.error('Enrollment error:', e);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
