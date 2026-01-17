import { getAgents, createEnrollmentKey } from '$lib/server/agents';
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
    }
};
