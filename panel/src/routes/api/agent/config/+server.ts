import { error } from '@sveltejs/kit';
import { validateAgentToken } from '$lib/server/agents';
import { generateAgentConfig } from '$lib/server/frp';
import { getSettings } from '$lib/server/settings';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('Missing or invalid auth header');
        throw error(401, 'Unauthorized');
    }

    const token = authHeader.split(' ')[1];
    const agent = await validateAgentToken(token);

    if (!agent) {
        console.log('Invalid token');
        throw error(401, 'Unauthorized');
    }

    const settings = await getSettings();
    const serverAddr = settings.serverEndpoint.split(':')[0]; // Hostname only
    // Use configured FRP port or default 7000
    const serverPort = settings.frpServerPort || 7000;

    // Note: We might want to use settings.frpAuthToken if global auth is used,
    // OR agent token if we support OIDC/plugin auth in FRP.
    // The "Final Stack" mentions "Authenticated SSE" but FRP connection needs auth too.
    // If we use global token:
    const frpToken = settings.frpAuthToken;

    const config = await generateAgentConfig(agent.id, serverAddr, serverPort, frpToken);

    return new Response(config, {
        headers: {
            'Content-Type': 'text/plain'
        }
    });
};
