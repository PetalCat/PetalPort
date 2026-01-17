import { getProxies, syncConfig as syncFrp } from '$lib/server/frp';
import { getPeers, syncConfig as syncWg, ensureIdentity } from '$lib/server/wireguard';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';

const CONFIG_ROOT = env.CONFIG_ROOT || '/config';

const init = async () => {
    console.log('[PetalPort] Initializing configuration...');

    // Ensure config dirs
    const frpDir = path.join(CONFIG_ROOT, 'frp');
    const wgDir = path.join(CONFIG_ROOT, 'wireguard');

    await fs.mkdir(frpDir, { recursive: true });
    await fs.mkdir(wgDir, { recursive: true });

    // Sync FRP
    const proxies = await getProxies();
    await syncFrp(proxies);
    console.log('[PetalPort] Verified frps.toml');

    // Sync WG
    const peers = await getPeers();
    await syncWg(peers);
    await ensureIdentity();
    console.log('[PetalPort] Verified wg0.conf');
};

init().catch(console.error);
