import { getAgents, createEnrollmentKey, saveAgents, renameAgent } from '$lib/server/agents';
import { deleteProxiesForAgent } from '$lib/server/frp';
import { emitToAgent } from '$lib/server/sse';
import { fail } from '@sveltejs/kit';

export const load = async () => {
    const agents = await getAgents();
    return {
        agents
    };
};

export const actions = {
    createKey: async () => {
        try {
            const key = await createEnrollmentKey();
            return { success: true, key };
        } catch (e) {
            console.error(e);
            return fail(500, { error: 'Failed to create key' });
        }
    },

    delete: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id') as string;

        if (!id) {
            return fail(400, { error: 'Agent ID required' });
        }

        // Notify agent to self-destruct
        emitToAgent(id, 'agent_deleted', {});

        // Clean up proxies
        await deleteProxiesForAgent(id);

        let agents = await getAgents();
        agents = agents.filter(a => a.id !== id);
        await saveAgents(agents);

        return { success: true };
    },

    rename: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id') as string;
        const name = data.get('name') as string;

        if (!id || !name) {
            return fail(400, { error: 'Missing parameters' });
        }

        const success = await renameAgent(id, name);
        if (!success) {
            return fail(404, { error: 'Agent not found' });
        }

        return { success: true };
    }
};
