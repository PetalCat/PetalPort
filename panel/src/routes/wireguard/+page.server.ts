import { fail } from '@sveltejs/kit';
import { getPeers, savePeers, createPeer } from '$lib/server/wireguard';

export const load = async () => {
    const peers = await getPeers();
    return {
        peers,
        // In a real app, we'd fetch this or have it in settings
        serverEndpoint: process.env.SERVER_ENDPOINT || 'vpn.example.com:51820',
        serverPublicKey: process.env.WG_SERVER_PUBLIC_KEY || 'SERVER_PUB_KEY_PLACEHOLDER'
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
