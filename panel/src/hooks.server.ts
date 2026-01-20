import { getProxies, syncConfig as syncFrp } from '$lib/server/frp';
import { getPeers, syncConfig as syncWg, ensureIdentity, ensureWireguardConfig } from '$lib/server/wireguard';
import fs from 'node:fs/promises';
import { chmod } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { redirect, type Handle } from '@sveltejs/kit';

import { allowPort } from '$lib/server/firewall';
import { getUsers, getUserById, getSession } from '$lib/server/db';



const CONFIG_ROOT = env.CONFIG_ROOT || '/config';

// Ensure permissions (CRIT-05)
const enforcePermissions = async (dir: string) => {
    try {
        const files = await fs.readdir(dir, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                await chmod(fullPath, 0o700);
                await enforcePermissions(fullPath);
            } else {
                if (file.name.endsWith('.json') || file.name.endsWith('.toml') || file.name.endsWith('.conf') || file.name.endsWith('.key')) {
                    await chmod(fullPath, 0o600);
                }
            }
        }
    } catch (e) {
        console.warn(`[PetalPort] Failed to enforce permissions on ${dir}:`, e);
    }
};

const init = async () => {
    console.log('[PetalPort] Initializing configuration...');

    // Print ADMIN_PASSWORD if not set? No, that's dangerous.
    if (!env.ADMIN_PASSWORD) {
        console.warn('====================================================');
        console.warn('[WARNING] ADMIN_PASSWORD environment variable not set!');
        console.warn('[WARNING] You will not be able to log in.');
        console.warn('====================================================');
    }

    // Ensure config dirs
    const frpDir = path.join(CONFIG_ROOT, 'frp');
    const wgDir = path.join(CONFIG_ROOT, 'wireguard');

    await fs.mkdir(frpDir, { recursive: true });
    await fs.mkdir(wgDir, { recursive: true });

    // Enforce permissions (CRIT-05)
    await enforcePermissions(CONFIG_ROOT);

    // Sync FRP
    const proxies = await getProxies();
    await syncFrp(proxies);

    // Sync Firewall (Re-apply rules for existing tunnels)
    console.log('[PetalPort] Syncing firewall rules...');
    for (const proxy of proxies) {
        try {
            await allowPort(proxy.bindPort, `FRP: ${proxy.name}`);
        } catch (e) {
            console.error(`[PetalPort] Failed to allow port ${proxy.bindPort}:`, e);
        }
    }

    console.log('[PetalPort] Verified frps.toml and Firewall');

    // Ensure WireGuard config exists FIRST (prevents linuxserver image from generating problematic config)
    await ensureWireguardConfig();

    // Sync WG
    const peers = await getPeers();
    await syncWg(peers);
    await ensureIdentity();
    console.log('[PetalPort] Verified wg0.conf');
};

import { RateLimiter } from 'sveltekit-rate-limiter/server';

const limiter = new RateLimiter({
    IP: [100, 'm'], // 100 requests per minute per IP
    IPUA: [50, 'm'], // 50 requests per minute per IP + User Agent
});

const authLimiter = new RateLimiter({
    IP: [5, 'm'], // 5 requests per minute for auth routes
});

// Invoke init
init().catch(err => {
    console.error('[PetalPort] Initialization failed:', err);
});

export const handle: Handle = async ({ event, resolve }) => {
    const { pathname } = event.url;

    // Apply strict limits to auth routes
    if (pathname.startsWith('/login') || pathname.startsWith('/register')) {
        if (await authLimiter.isLimited(event)) {
            return new Response('Too Many Requests', { status: 429 });
        }
    } else if (!pathname.startsWith('/api/agent')) {
        // Apply general limits to non-agent API routes (Agents might be chatty)
        if (await limiter.isLimited(event)) {
            return new Response('Too Many Requests', { status: 429 });
        }
    }

    const sessionId = event.cookies.get('session');

    // Check if any users exist (First Run)
    const users = await getUsers();
    if (users.length === 0) {
        if (!pathname.startsWith('/register') && !pathname.startsWith('/api/agent')) {
            throw redirect(303, '/register');
        }
    }

    // Load user from session
    if (sessionId) {
        const session = await getSession(sessionId);
        if (session) {
            const user = await getUserById(session.userId);
            if (user) {
                event.locals.user = user;
            }
        }

        if (!event.locals.user) {
            // Invalid or expired session
            event.cookies.delete('session', { path: '/' });
        }
    }

    // Public routes
    const isPublic = pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/api/agent');

    if (isPublic) {
        // If already logged in and going to login/register, redirect home
        if (event.locals.user && (pathname === '/login' || pathname === '/register')) {
            throw redirect(303, '/');
        }
        return resolve(event);
    }

    // Protected routes
    if (!event.locals.user) {
        throw redirect(303, '/login');
    }

    return resolve(event);
};
