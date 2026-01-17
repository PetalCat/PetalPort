import { error } from '@sveltejs/kit';
import { validateAgentToken } from '$lib/server/agents';
import { addClient, removeClient } from '$lib/server/sse';
import type { RequestHandler } from './$types';

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

    const stream = new ReadableStream({
        start(controller) {
            addClient(agent.id, controller);

            // Send initial ping
            const message = `event: hello\ndata: {"connected": true}\n\n`;
            controller.enqueue(message);
        },
        cancel(controller) {
            removeClient(agent.id, controller);
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
};
