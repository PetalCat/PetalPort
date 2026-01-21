const fs = require('fs');
const axios = require('axios');
const EventSource = require('eventsource');
const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const nacl = require('tweetnacl');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration
const PANEL_URL = process.env.PANEL_URL || 'http://localhost:8456';
const ENROLL_KEY = process.env.ENROLL_KEY;
const AGENT_ID = process.env.AGENT_ID || 'unknown-agent'; // usually assigned by server
const CONFIG_PATH = process.env.CONFIG_PATH || '/etc/frp/frpc.ini';
const TOKEN_FILE = process.env.TOKEN_FILE || '/data/agent_token';
const WG_KEY_FILE = process.env.WG_KEY_FILE || '/data/wg_private.key';
const WG_CONF_FILE = process.env.WG_CONF_FILE || '/etc/wireguard/wg0.conf';
const AGENT_VERSION = '1.0.0';

// State
let agentToken = null;
let agentId = null;
let frpcProcess = null;
let wgInterfaceUp = false;

// UDP forwarding state with status tracking
let currentUdpForwards = []; // { name, listenPort, localIp, localPort, active, error? }

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to safely execute iptables commands
async function iptables(args) {
    const cmd = `iptables ${args}`;
    try {
        await execAsync(cmd);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.stderr || e.message };
    }
}

async function main() {
    console.log(`[Wrapper] Starting PetalPort Agent...`);

    // Ensure WireGuard Key
    const wgKeyPair = await ensureWgKey();

    // 1. Authenticate / Enroll
    if (fs.existsSync(TOKEN_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            agentToken = data.token;
            agentId = data.agentId;
            console.log(`[Wrapper] Loaded existing token for agent: ${agentId}`);
        } catch (e) {
            console.error('[Wrapper] Failed to read token file:', e.message);
        }
    }

    if (!agentToken) {
        if (!ENROLL_KEY) {
            console.error('[Wrapper] No token found and no ENROLL_KEY provided. Exiting.');
            process.exit(1);
        }
        await enroll(wgKeyPair.publicKey);
    }

    // 2. Initial Config Pull (FRP + WG)
    // We get FRP config via /api/agent/config (text)
    // Where do we get WG config? It was returned in enroll, but what if we restart?
    // We should probably persist wg0.conf or fetch it again.
    // For now, let's assume enroll returns it and we save it. 
    // BUT if we restart, we need to fetch it. The current /api/agent/config is for FRPC only.
    // We might need a new endpoint or update config to return JSON with both.
    // OR, we just use the static wg0.conf we generated during enroll? 
    // The server IP/endpoint might change.
    // Let's assume we rely on enroll for now, and if we already have a token, we might need to re-fetch WG details?
    // Actually, keeping it simple: We save wg0.conf.

    // 3. Start WireGuard
    if (fs.existsSync(WG_CONF_FILE)) {
        await startWireGuard();
    }

    // 4. Update FRP Config
    await updateConfig();

    // 5. Start FRPC
    startFrpc();

    // 6. Start SSE & Status Loop
    startSSE();
    startHeartbeat();
}

// WireGuard Helpers
function generateWgKeyPair() {
    const keyPair = nacl.box.keyPair();
    const privateKey = Buffer.from(keyPair.secretKey).toString('base64');
    const publicKey = Buffer.from(keyPair.publicKey).toString('base64');
    return { privateKey, publicKey };
}

async function ensureWgKey() {
    if (fs.existsSync(WG_KEY_FILE)) {
        const privateKey = fs.readFileSync(WG_KEY_FILE, 'utf8').trim();
        // Derive public key from private key? TweetNaCl doesn't expose this easily without re-generating from secret.
        // Usually we store both or re-derive. nacl.box.keyPair.fromSecretKey(secretKey)
        const secretKey = Buffer.from(privateKey, 'base64');
        const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
        const publicKey = Buffer.from(keyPair.publicKey).toString('base64');
        return { privateKey, publicKey };
    } else {
        console.log('[Wrapper] Generating new WireGuard keypair...');
        const keys = generateWgKeyPair();
        // Ensure directory
        if (!fs.existsSync(path.dirname(WG_KEY_FILE))) {
            fs.mkdirSync(path.dirname(WG_KEY_FILE), { recursive: true });
        }
        fs.writeFileSync(WG_KEY_FILE, keys.privateKey, { mode: 0o600 });
        return keys;
    }
}

async function enroll(wgPublicKey) {
    console.log(`[Wrapper] Enrolling with key...`);
    try {
        const meta = {
            hostname: process.env.HOSTNAME || 'unknown',
            arch: process.arch,
            platform: process.platform
        };

        const res = await axios.post(`${PANEL_URL}/api/agent/enroll`, {
            enrollKey: ENROLL_KEY,
            meta,
            wgPublicKey
        });

        agentToken = res.data.token;
        agentId = res.data.agentId;

        // Persist token
        if (!fs.existsSync(path.dirname(TOKEN_FILE))) {
            fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
        }
        fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: agentToken, agentId }));
        console.log(`[Wrapper] Enrolled successfully. ID: ${agentId}`);

        // Handle WireGuard Config
        if (res.data.wgAddress && res.data.wgEndpoint) {
            const wgConf = `[Interface]
PrivateKey = ${fs.readFileSync(WG_KEY_FILE, 'utf8').trim()}
Address = ${res.data.wgAddress}
MTU = 1420

[Peer]
PublicKey = ${res.data.wgPublicKey}
Endpoint = ${res.data.wgEndpoint}
AllowedIPs = ${res.data.wgAllowedIps}
PersistentKeepalive = 25
`;
            if (!fs.existsSync(path.dirname(WG_CONF_FILE))) {
                fs.mkdirSync(path.dirname(WG_CONF_FILE), { recursive: true });
            }
            fs.writeFileSync(WG_CONF_FILE, wgConf, { mode: 0o600 });
            console.log('[Wrapper] WireGuard config saved.');
            await startWireGuard();
        }

    } catch (e) {
        console.error('[Wrapper] Enrollment failed:', e.response?.data || e.message);
        await sleep(5000);
        process.exit(1); // Retry handled by container restart
    }
}

async function startWireGuard() {
    if (wgInterfaceUp) return;
    console.log('[Wrapper] Starting WireGuard...');

    try {
        // First, try to bring down any existing wg0 interface (from previous run)
        try {
            await execAsync(`wg-quick down wg0`);
            console.log('[Wrapper] Brought down existing wg0 interface.');
        } catch (e) {
            // Ignore - interface might not exist
        }

        // Now bring up the interface
        await execAsync(`wg-quick up ${WG_CONF_FILE}`);
        console.log('[Wrapper] WireGuard interface started.');
        wgInterfaceUp = true;

        // Initialize UDP forwarding rules after WG is up
        await updateUdpForwards();
    } catch (e) {
        console.error('[Wrapper] Failed to start WireGuard:', e.stderr || e.message);
    }
}

async function updateConfig() {
    console.log('[Wrapper] Checking for config updates...');
    try {
        const res = await axios.get(`${PANEL_URL}/api/agent/config`, {
            headers: { 'Authorization': `Bearer ${agentToken}` },
            responseType: 'text'
        });

        const newConfig = res.data;

        // Write config
        if (!fs.existsSync(path.dirname(CONFIG_PATH))) {
            fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        }
        fs.writeFileSync(CONFIG_PATH, newConfig);
        console.log('[Wrapper] FRP Config updated.');

        // Reload FRPC
        reloadFrpc();

        // Also update UDP forwarding rules
        await updateUdpForwards();
    } catch (e) {
        // Handle token invalidation (401) - re-enroll if ENROLL_KEY is available
        if (e.response?.status === 401) {
            console.warn('[Wrapper] Token invalid (401). Clearing token and attempting re-enrollment...');
            await handleTokenInvalidation();
            return;
        }
        console.error('[Wrapper] Failed to pull config:', e.message);
    }
}

async function handleTokenInvalidation() {
    // Clear the stale token
    if (fs.existsSync(TOKEN_FILE)) {
        fs.unlinkSync(TOKEN_FILE);
        console.log('[Wrapper] Removed stale token file.');
    }
    agentToken = null;
    agentId = null;

    // Try to re-enroll if we have an enrollment key
    if (ENROLL_KEY) {
        console.log('[Wrapper] Attempting re-enrollment with ENROLL_KEY...');
        const wgKeyPair = await ensureWgKey();
        await enroll(wgKeyPair.publicKey);
        // After re-enrollment, try to pull config again
        await updateConfig();
    } else {
        console.error('[Wrapper] No ENROLL_KEY available for re-enrollment. Agent needs to be re-deployed with a new key.');
        process.exit(1);
    }
}

async function updateUdpForwards() {
    if (!wgInterfaceUp) {
        console.log('[Wrapper] WireGuard not up, skipping UDP forwards');
        return;
    }

    console.log('[Wrapper] Updating UDP forwarding rules...');
    try {
        const res = await axios.get(`${PANEL_URL}/api/agent/udp-forwards`, {
            headers: { 'Authorization': `Bearer ${agentToken}` }
        });

        const newForwards = res.data.forwards || [];

        // Build a map of current forwards by key for quick lookup
        const currentMap = new Map(currentUdpForwards.map(f => [forwardKey(f), f]));
        const newMap = new Map(newForwards.map(f => [forwardKey(f), f]));

        // Remove rules that are no longer needed
        for (const [key, oldFwd] of currentMap) {
            if (!newMap.has(key)) {
                await removeUdpForward(oldFwd);
            }
        }

        // Add new rules (with status tracking)
        const updatedForwards = [];
        for (const newFwd of newForwards) {
            const key = forwardKey(newFwd);
            const existing = currentMap.get(key);

            if (existing && existing.active) {
                // Keep existing active forward
                updatedForwards.push(existing);
            } else {
                // Add new forward
                const result = await addUdpForward(newFwd);
                updatedForwards.push({
                    ...newFwd,
                    active: result.success,
                    error: result.error
                });
            }
        }

        currentUdpForwards = updatedForwards;
        const activeCount = updatedForwards.filter(f => f.active).length;
        console.log(`[Wrapper] UDP forwards: ${activeCount}/${updatedForwards.length} active`);
    } catch (e) {
        console.error('[Wrapper] Failed to update UDP forwards:', e.message);
    }
}

function forwardKey(fwd) {
    return `${fwd.listenPort}:${fwd.localIp}:${fwd.localPort}`;
}

async function addUdpForward(fwd) {
    console.log(`[Wrapper] Adding UDP forward: wg0:${fwd.listenPort} -> ${fwd.localIp}:${fwd.localPort}`);
    const errors = [];

    // Enable IP forwarding (do this once, ignore if already enabled)
    try {
        await execAsync('sysctl -w net.ipv4.ip_forward=1');
    } catch (e) {
        console.warn('[Wrapper] IP forwarding might already be enabled');
    }

    // DNAT rule: traffic arriving on wg0 for this port -> forward to local target
    const dnatResult = await iptables(
        `-t nat -A PREROUTING -i wg0 -p udp --dport ${fwd.listenPort} -j DNAT --to-destination ${fwd.localIp}:${fwd.localPort}`
    );
    if (!dnatResult.success) {
        errors.push(`DNAT: ${dnatResult.error}`);
    }

    // For localhost, we also need to handle locally-generated traffic going to wg0 IP
    // Add OUTPUT chain rule for traffic from local processes
    if (fwd.localIp === '127.0.0.1' || fwd.localIp === 'localhost') {
        // Also add to OUTPUT chain for locally-initiated traffic
        await iptables(
            `-t nat -A OUTPUT -p udp --dport ${fwd.listenPort} -j DNAT --to-destination ${fwd.localIp}:${fwd.localPort}`
        );
    } else {
        // If forwarding to a non-localhost address, we need MASQUERADE for return traffic
        const masqResult = await iptables(
            `-t nat -A POSTROUTING -p udp -d ${fwd.localIp} --dport ${fwd.localPort} -j MASQUERADE`
        );
        if (!masqResult.success) {
            errors.push(`MASQ: ${masqResult.error}`);
        }
    }

    if (errors.length > 0) {
        const errorMsg = errors.join('; ');
        console.error(`[Wrapper] UDP forward setup had issues: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }

    console.log(`[Wrapper] UDP forward active: wg0:${fwd.listenPort} -> ${fwd.localIp}:${fwd.localPort}`);
    return { success: true };
}

async function removeUdpForward(fwd) {
    console.log(`[Wrapper] Removing UDP forward: wg0:${fwd.listenPort} -> ${fwd.localIp}:${fwd.localPort}`);

    // Remove DNAT rule
    await iptables(
        `-t nat -D PREROUTING -i wg0 -p udp --dport ${fwd.listenPort} -j DNAT --to-destination ${fwd.localIp}:${fwd.localPort}`
    );

    if (fwd.localIp === '127.0.0.1' || fwd.localIp === 'localhost') {
        await iptables(
            `-t nat -D OUTPUT -p udp --dport ${fwd.listenPort} -j DNAT --to-destination ${fwd.localIp}:${fwd.localPort}`
        );
    } else {
        await iptables(
            `-t nat -D POSTROUTING -p udp -d ${fwd.localIp} --dport ${fwd.localPort} -j MASQUERADE`
        );
    }
}

function startFrpc() {
    if (frpcProcess) return;

    console.log('[Wrapper] Starting frpc...');
    // We assume frpc is in path or we use absolute path
    // snowdreamtech/frpc image puts it in /usr/bin/frpc usually
    frpcProcess = spawn('frpc', ['-c', CONFIG_PATH], { stdio: 'inherit' });

    frpcProcess.on('exit', (code) => {
        console.warn(`[Wrapper] frpc exited with code ${code}`);
        frpcProcess = null;
        // logic to restart? or let container die?
        // simple logic: restart after delay
        setTimeout(startFrpc, 5000);
    });
}

function reloadFrpc() {
    if (frpcProcess) {
        console.log('[Wrapper] Reloading frpc (SIGHUP)...');
        // frpc supports reload? usually yes via management api or common "admin" port reload.
        // OR standard SIGHUP?
        // If FRPC is just the binary:
        // Recent FRPC versions support reload via `frpc reload -c ...` usage or admin API.
        // Snowdreamtech image might just need restart.
        // Safer to just kill and restart for "Dead Simple".
        frpcProcess.kill('SIGTERM');
        // startFrpc will handle restart via exit handler
    } else {
        startFrpc();
    }
}

function startSSE() {
    console.log('[Wrapper] Connecting to event stream...');
    const es = new EventSource(`${PANEL_URL}/api/agent/events`, {
        headers: { 'Authorization': `Bearer ${agentToken}` }
    });

    es.onopen = () => {
        console.log('[Wrapper] SSE Connected.');
    };

    es.addEventListener('config_updated', (e) => {
        console.log('[Wrapper] Received config_updated event.');
        updateConfig();
    });

    es.addEventListener('agent_deleted', (e) => {
        console.warn('[Wrapper] Agent deleted by server. Self-destructing...');
        // Remove token file
        if (fs.existsSync(TOKEN_FILE)) {
            fs.unlinkSync(TOKEN_FILE);
        }
        // Kill frpc
        if (frpcProcess) frpcProcess.kill();
        // Down WG
        if (wgInterfaceUp) exec(`wg-quick down ${WG_CONF_FILE}`);

        console.log('[Wrapper] Goodbye.');
        process.exit(0);
    });

    es.onerror = (e) => {
        console.error('[Wrapper] SSE Error. Reconnecting...');
        // EventSource autoconnects, but sometimes we need to force
    };
}

function startHeartbeat() {
    // Send initial status immediately
    sendHeartbeat();

    // Then send every 30 seconds
    setInterval(sendHeartbeat, 30000);
}

async function sendHeartbeat() {
    try {
        const stats = await getTrafficStats();

        await axios.post(`${PANEL_URL}/api/agent/status`, {
            status: 'online',
            meta: {
                uptime: process.uptime(),
                version: AGENT_VERSION
            },
            stats,
            wgStatus: wgInterfaceUp ? 'up' : 'down',
            udpForwards: currentUdpForwards.map(f => ({
                name: f.name,
                listenPort: f.listenPort,
                localIp: f.localIp,
                localPort: f.localPort,
                active: f.active,
                error: f.error
            }))
        }, {
            headers: { 'Authorization': `Bearer ${agentToken}` }
        });
    } catch (e) {
        // silent fail
    }
}

async function getTrafficStats() {
    try {
        // FRPC admin API: http://127.0.0.1:7400/api/status
        // We enabled this in frp.ts config generation
        const res = await axios.get('http://127.0.0.1:7400/api/status');
        // Structure: { tcp: [ { name, conf, today_traffic_in, today_traffic_out, cur_conns } ], ... }
        // We want total sum
        let rx = 0;
        let tx = 0;

        const types = ['tcp', 'udp', 'http', 'https', 'stcp', 'xtcp'];
        for (const type of types) {
            if (res.data[type]) {
                for (const proxy of res.data[type]) {
                    rx += proxy.today_traffic_in || 0;
                    tx += proxy.today_traffic_out || 0;
                }
            }
        }
        return { rx, tx };
    } catch (e) {
        return { rx: 0, tx: 0 };
    }
}

main();
