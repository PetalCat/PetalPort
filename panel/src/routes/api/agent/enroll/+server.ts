import { json } from '@sveltejs/kit';
import { redeemEnrollmentKey } from '$lib/server/agents';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { enrollKey, meta, wgPublicKey } = body;

        if (!enrollKey) {
            return json({ error: 'Missing enrollment key' }, { status: 400 });
        }

        const result = await redeemEnrollmentKey(enrollKey, meta, wgPublicKey);

        if (!result) {
            return json({ error: 'Invalid or expired enrollment key' }, { status: 401 });
        }

        const { agent, peer } = result;

        return json({
            token: agent.token,
            agentId: agent.id,
            name: agent.name,
            // WireGuard Config
            wgPrivateKey: peer?.privateKey,
            wgAddress: peer?.allowedIps.split('/')[0], // Client usually wants just the IP
            wgEndpoint: env.SERVER_ENDPOINT || 'vpn.example.com:51820',
            wgPublicKey: env.WG_SERVER_PUBLIC_KEY || 'SERVER_PUB_KEY_PLACEHOLDER', // In real app, read from server.pub
            wgAllowedIps: '10.13.13.0/24' // Default to VPN subnet routing? Or specific?
        });
    } catch (e) {
        console.error('Enrollment error:', e);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
