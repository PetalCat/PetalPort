import { fail } from '@sveltejs/kit';
import { getPeers, savePeers, createPeer, getServerPublicKey } from '$lib/server/wireguard';
import { getAgents } from '$lib/server/agents';
import { env } from '$env/dynamic/private';

export const load = async () => {
    const peers = await getPeers();
    const agents = await getAgents();
    const serverPublicKey = await getServerPublicKey();

    // Enrich peers with agent info
    const enrichedPeers = peers.map(peer => {
        const linkedAgent = agents.find(a => a.wgPeerId === peer.id);
        return {
            ...peer,
            linkedAgentId: linkedAgent?.id,
            linkedAgentName: linkedAgent?.name,
            isDevice: !linkedAgent // True if this is a standalone device (not linked to an agent)
        };
    });

    return {
        peers: enrichedPeers,
        serverEndpoint: env.SERVER_ENDPOINT || 'vpn.example.com:443',
        serverPublicKey
    };
};

export const actions = {
    create: async ({ request }) => {
        const data = await request.formData();
        const name = data.get('name') as string;

        if (!name) {
            return fail(400, { missing: true });
        }

        try {
            await createPeer(name);
        } catch (e: any) {
            return fail(400, { error: e.message || 'Failed to create peer' });
        }

        return { success: true };
    },

    delete: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id') as string;

        let peers = await getPeers();
        peers = peers.filter(p => p.id !== id);
        await savePeers(peers);

        return { success: true };
    },

    toggle: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id') as string;

        const peers = await getPeers();
        const peer = peers.find(p => p.id === id);
        if (peer) {
            peer.enabled = !peer.enabled;
            await savePeers(peers);
        }
        return { success: true };
    }
};
