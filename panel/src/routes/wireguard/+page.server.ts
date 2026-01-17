import { fail } from '@sveltejs/kit';
import { getPeers, savePeers, generateKeyPair, type Peer } from '$lib/server/wireguard';
import { randomUUID } from 'node:crypto';

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

        const peers = await getPeers();

        // Simple IP allocation: find next available .X
        // Assuming /24 network 10.13.13.0/24. Server is .1
        const usedIps = new Set(peers.map(p => {
            const parts = p.allowedIps.split('.');
            return parseInt(parts[3].split('/')[0]); // "10.13.13.2/32" -> 2
        }));

        let octet = 2;
        while (usedIps.has(octet)) octet++;

        if (octet > 254) {
            return fail(400, { error: 'Subnet exhausted' });
        }

        const keys = await generateKeyPair();

        const newPeer: Peer = {
            id: randomUUID(),
            name,
            publicKey: keys.publicKey,
            privateKey: keys.privateKey, // Stored so we can show QR code later (optional security risk, but convenient for personal VPN)
            allowedIps: `10.13.13.${octet}/32`,
            createdAt: new Date().toISOString(),
            enabled: true
        };

        peers.push(newPeer);
        await savePeers(peers);

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
