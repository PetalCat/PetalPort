import { json } from '@sveltejs/kit';
import { redeemEnrollmentKey } from '$lib/server/agents';
import { getServerPublicKey } from '$lib/server/wireguard';
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
        const serverPublicKey = await getServerPublicKey();

        return json({
            token: agent.token,
            agentId: agent.id,
            name: agent.name,
            // WireGuard Config
            wgPrivateKey: peer?.privateKey,
            wgAddress: peer?.allowedIps, // Full CIDR notation (e.g., 10.13.13.2/32)
            wgEndpoint: env.SERVER_ENDPOINT || 'vpn.example.com:443',
            wgPublicKey: serverPublicKey,
            wgAllowedIps: '10.13.13.0/24' // VPN subnet routing
        });
    } catch (e) {
        console.error('Enrollment error:', e);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
