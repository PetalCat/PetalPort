const fs = require('fs');
const axios = require('axios');
const EventSource = require('eventsource');
const { spawn, exec } = require('child_process');
const path = require('path');
const nacl = require('tweetnacl');

// Configuration
const PANEL_URL = process.env.PANEL_URL || 'http://localhost:8456';
const ENROLL_KEY = process.env.ENROLL_KEY;
const AGENT_ID = process.env.AGENT_ID || 'unknown-agent'; // usually assigned by server
const CONFIG_PATH = process.env.CONFIG_PATH || '/etc/frp/frpc.ini';
const TOKEN_FILE = process.env.TOKEN_FILE || '/data/agent_token';
const WG_KEY_FILE = process.env.WG_KEY_FILE || '/data/wg_private.key';
const WG_CONF_FILE = process.env.WG_CONF_FILE || '/etc/wireguard/wg0.conf';

// State
let agentToken = null;
let agentId = null;
let frpcProcess = null;
let wgInterfaceUp = false;
let currentUdpForwards = []; // Track current UDP forwarding rules

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
            console.log(`[Wrapper] creating session for agent: ${agentId}`);
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
        startWireGuard();
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
            startWireGuard();
        }

    } catch (e) {
        console.error('[Wrapper] Enrollment failed:', e.response?.data || e.message);
        await sleep(5000);
        process.exit(1); // Retry handled by container restart
    }
}

function startWireGuard() {
    if (wgInterfaceUp) return;
    console.log('[Wrapper] Starting WireGuard...');

    // wg-quick up wg0
    exec(`wg-quick up ${WG_CONF_FILE}`, async (err, stdout, stderr) => {
        if (err) {
            console.error('[Wrapper] Failed to start WireGuard:', stderr);
            // Don't exit, maybe temporary?
        } else {
            console.log('[Wrapper] WireGuard interface started.');
            wgInterfaceUp = true;

            // Initialize UDP forwarding rules after WG is up
            await updateUdpForwards();
        }
    });
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
        console.error('[Wrapper] Failed to pull config:', e.message);
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

        // Remove old rules that are no longer needed
        for (const oldFwd of currentUdpForwards) {
            const stillExists = newForwards.some(
                f => f.listenPort === oldFwd.listenPort && f.localIp === oldFwd.localIp && f.localPort === oldFwd.localPort
            );
            if (!stillExists) {
                await removeUdpForward(oldFwd);
            }
        }

        // Add new rules
        for (const newFwd of newForwards) {
            const alreadyExists = currentUdpForwards.some(
                f => f.listenPort === newFwd.listenPort && f.localIp === newFwd.localIp && f.localPort === newFwd.localPort
            );
            if (!alreadyExists) {
                await addUdpForward(newFwd);
            }
        }

        currentUdpForwards = newForwards;
        console.log(`[Wrapper] UDP forwards: ${newForwards.length} active`);
    } catch (e) {
        console.error('[Wrapper] Failed to update UDP forwards:', e.message);
    }
}

async function addUdpForward(fwd) {
    console.log(`[Wrapper] Adding UDP forward: wg0:${fwd.listenPort} -> ${fwd.localIp}:${fwd.localPort}`);

    // Enable IP forwarding
    exec('sysctl -w net.ipv4.ip_forward=1', (err) => {
        if (err) console.error('[Wrapper] Failed to enable IP forwarding:', err.message);
    });

    // DNAT rule: traffic arriving on wg0 for this port -> forward to local target
    const dnatCmd = `iptables -t nat -A PREROUTING -i wg0 -p udp --dport ${fwd.listenPort} -j DNAT --to-destination ${fwd.localIp}:${fwd.localPort}`;

    exec(dnatCmd, (err, stdout, stderr) => {
        if (err) {
            console.error(`[Wrapper] Failed to add DNAT rule: ${stderr}`);
        }
    });

    // If forwarding to a non-localhost address, we need MASQUERADE for return traffic
    if (fwd.localIp !== '127.0.0.1' && fwd.localIp !== 'localhost') {
        const masqCmd = `iptables -t nat -A POSTROUTING -p udp -d ${fwd.localIp} --dport ${fwd.localPort} -j MASQUERADE`;
        exec(masqCmd, (err, stdout, stderr) => {
            if (err) {
                console.error(`[Wrapper] Failed to add MASQUERADE rule: ${stderr}`);
            }
        });
    }

    // Allow forwarded traffic
    const fwdCmd = `iptables -A FORWARD -i wg0 -p udp --dport ${fwd.listenPort} -j ACCEPT`;
    exec(fwdCmd, (err) => {
        if (err) console.error('[Wrapper] Failed to add FORWARD rule');
    });
}

async function removeUdpForward(fwd) {
    console.log(`[Wrapper] Removing UDP forward: wg0:${fwd.listenPort} -> ${fwd.localIp}:${fwd.localPort}`);

    const dnatCmd = `iptables -t nat -D PREROUTING -i wg0 -p udp --dport ${fwd.listenPort} -j DNAT --to-destination ${fwd.localIp}:${fwd.localPort}`;
    exec(dnatCmd, (err) => {
        if (err) console.error('[Wrapper] Failed to remove DNAT rule (may not exist)');
    });

    if (fwd.localIp !== '127.0.0.1' && fwd.localIp !== 'localhost') {
        const masqCmd = `iptables -t nat -D POSTROUTING -p udp -d ${fwd.localIp} --dport ${fwd.localPort} -j MASQUERADE`;
        exec(masqCmd, (err) => {
            if (err) console.error('[Wrapper] Failed to remove MASQUERADE rule (may not exist)');
        });
    }

    const fwdCmd = `iptables -D FORWARD -i wg0 -p udp --dport ${fwd.listenPort} -j ACCEPT`;
    exec(fwdCmd, (err) => {
        if (err) console.error('[Wrapper] Failed to remove FORWARD rule (may not exist)');
    });
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
    setInterval(async () => {
        try {
            const stats = await getTrafficStats();

            await axios.post(`${PANEL_URL}/api/agent/status`, {
                status: 'online',
                meta: {
                    uptime: process.uptime()
                },
                stats
            }, {
                headers: { 'Authorization': `Bearer ${agentToken}` }
            });
        } catch (e) {
            // silent fail
        }
    }, 30000); // 30s
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
