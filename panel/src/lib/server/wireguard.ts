import fs from 'node:fs/promises';
import path from 'node:path';
import { restartContainer } from './docker';

// const execAsync = promisify(exec); // Removed


import { env } from '$env/dynamic/private';

const CONFIG_ROOT = env.CONFIG_ROOT || '/config';
const CONFIG_DIR = path.join(CONFIG_ROOT, 'wireguard');
const PEERS_FILE = path.join(CONFIG_DIR, 'peers.json');
const WG_CONF_FILE = path.join(CONFIG_DIR, 'wg0.conf');

export interface Peer {
    id: string; // UUID
    name: string;
    publicKey: string;
    privateKey?: string; // Only available on creation
    presharedKey?: string;
    allowedIps: string; // e.g., "10.13.13.2/32"
    createdAt: string;
    enabled: boolean;
}

export const getPeers = async (): Promise<Peer[]> => {
    try {
        const data = await fs.readFile(PEERS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

export const savePeers = async (peers: Peer[]) => {
    await fs.writeFile(PEERS_FILE, JSON.stringify(peers, null, 2));
    await syncConfig(peers);
};

import nacl from 'tweetnacl';

export const generateKeyPair = async () => {
    // Use tweetnacl (Curve25519) exclusively to avoid shell usage
    const pair = nacl.box.keyPair();
    const privateKey = Buffer.from(pair.secretKey).toString('base64');
    const publicKey = Buffer.from(pair.publicKey).toString('base64');

    return { privateKey, publicKey };
};

export const getPublicKey = async (privateKey: string): Promise<string> => {
    // Use tweetnacl to derive public key
    const secretKey = new Uint8Array(Buffer.from(privateKey, 'base64'));
    const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
    return Buffer.from(keyPair.publicKey).toString('base64');
};

export const ensureIdentity = async () => {
    const identityFile = path.join(CONFIG_DIR, 'identity.conf');
    try {
        await fs.access(identityFile);
    } catch {
        console.log('[PetalPort] Generating identity.conf...');
        const { privateKey } = await generateKeyPair();

        const serverPrivKey = env.WG_PRIVATE_KEY;
        let serverPubKey = 'SERVER_PUB_KEY_PLACEHOLDER';

        if (serverPrivKey) {
            try {
                serverPubKey = await getPublicKey(serverPrivKey);
            } catch (e) {
                console.error('Failed to derive server public key:', e);
            }
        }

        const endpoint = env.SERVER_ENDPOINT || 'localhost:51820';

        const content = `[Interface]
PrivateKey = ${privateKey}
Address = 10.13.13.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = ${serverPubKey}
Endpoint = ${endpoint}
AllowedIPs = 0.0.0.0/0, ::/0
`;
        await fs.writeFile(identityFile, content);
        console.log('[PetalPort] Generated identity.conf');
    }
};

export const syncConfig = async (peers: Peer[]) => {
    // Server config
    let config = `[Interface]
Address = 10.13.13.1/24
ListenPort = 51820
PrivateKey = ${process.env.WG_PRIVATE_KEY || 'REPLACE_ME_WITH_SERVER_KEY'}
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

`;

    // Append peers
    for (const peer of peers) {
        if (!peer.enabled) continue;
        config += `[Peer]
# Name: ${peer.name}
PublicKey = ${peer.publicKey}
AllowedIPs = ${peer.allowedIps}
`;
        if (peer.presharedKey) {
            config += `PresharedKey = ${peer.presharedKey}\n`;
        }
        config += '\n';
    }

    await fs.writeFile(WG_CONF_FILE, config);
    // Restart WireGuard to apply changes
    // await restartContainer('petalport-wireguard');
    // Or maybe just sync? Restart is safer for full apply.
};
