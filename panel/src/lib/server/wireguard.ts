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

const SERVER_KEY_FILE = path.join(CONFIG_DIR, 'server.key');
const SERVER_PUB_FILE = path.join(CONFIG_DIR, 'server.pub');

export const ensureServerKey = async (): Promise<string> => {
    try {
        const key = await fs.readFile(SERVER_KEY_FILE, 'utf-8');
        return key.trim();
    } catch {
        console.log('[PetalPort] Generating server key pair...');
        const { privateKey, publicKey } = await generateKeyPair();
        await fs.writeFile(SERVER_KEY_FILE, privateKey);
        await fs.writeFile(SERVER_PUB_FILE, publicKey);
        console.log('[PetalPort] Generated server key pair');
        return privateKey;
    }
};

import { randomUUID } from 'node:crypto';

export const createPeer = async (name: string, clientPublicKey?: string): Promise<Peer> => {
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
        throw new Error('Subnet exhausted');
    }

    let publicKey = clientPublicKey;
    let privateKey: string | undefined;

    if (!publicKey) {
        const keys = await generateKeyPair();
        publicKey = keys.publicKey;
        privateKey = keys.privateKey;
    }

    const newPeer: Peer = {
        id: randomUUID(),
        name,
        publicKey,
        privateKey, // Only stored if generated server-side
        allowedIps: `10.13.13.${octet}/32`,
        createdAt: new Date().toISOString(),
        enabled: true
    };

    peers.push(newPeer);
    await savePeers(peers);

    return newPeer;
};

import { getProxies } from './frp';
import { getAgents } from './agents';

export const syncConfig = async (peers: Peer[]) => {
    const privateKey = await ensureServerKey();
    const proxies = await getProxies();
    const agents = await getAgents();

    // Generate DNAT rules for UDP proxies
    let postUpRules = 'iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE';
    let postDownRules = 'iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE';

    for (const proxy of proxies) {
        if (proxy.type !== 'udp') continue;

        // Find Agent
        const agent = agents.find(a => a.id === proxy.agentId);
        if (!agent) continue;

        // Find Peer:
        // 1. By Agent's Linked Peer ID (Robust)
        // 2. Fallback: Agent Name === Peer Name (Legacy/Manual)
        let peer = peers.find(p => p.id === agent.wgPeerId);
        if (!peer) {
            peer = peers.find(p => p.name === agent.name);
        }

        if (!peer) {
            console.warn(`[WireGuard] Could not find peer for UDP proxy ${proxy.name} (Agent: ${agent.name})`);
            continue;
        }

        // Extract Peer IP
        const peerIp = peer.allowedIps.split('/')[0];

        // 2️⃣ Stable NAT mapping on the EDGE (DNAT)
        // iptables -t nat -A PREROUTING -p udp --dport <BIND> -j DNAT --to-destination <PEER_IP>:<LOCAL_PORT>
        postUpRules += `; iptables -t nat -A PREROUTING -p udp --dport ${proxy.bindPort} -j DNAT --to-destination ${peerIp}:${proxy.localPort}`;
        postDownRules += `; iptables -t nat -D PREROUTING -p udp --dport ${proxy.bindPort} -j DNAT --to-destination ${peerIp}:${proxy.localPort}`;
    }

    // 4️⃣ MTU control (1380)
    // Server config
    let config = `[Interface]
Address = 10.13.13.1/24
ListenPort = 51820
PrivateKey = ${privateKey}
MTU = 1380
PostUp = ${postUpRules}
PostDown = ${postDownRules}

`;

    // Append peers
    for (const peer of peers) {
        if (!peer.enabled) continue;
        config += `[Peer]
# Name: ${peer.name}
PublicKey = ${peer.publicKey}
AllowedIPs = ${peer.allowedIps}
PersistentKeepalive = 25
`;
        if (peer.presharedKey) {
            config += `PresharedKey = ${peer.presharedKey}\n`;
        }
        config += '\n';
    }

    await fs.writeFile(WG_CONF_FILE, config);
    // Restart WireGuard to apply changes
    try {
        await restartContainer('petalport-wireguard');
    } catch (e) {
        console.error('[PetalPort] Failed to restart WireGuard container:', e);
    }
};
