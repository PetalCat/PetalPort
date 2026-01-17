import { getAgents, createEnrollmentKey, saveAgents } from '$lib/server/agents';
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

        let agents = await getAgents();
        agents = agents.filter(a => a.id !== id);
        await saveAgents(agents);

        return { success: true };
    }
};
