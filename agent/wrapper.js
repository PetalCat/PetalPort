const fs = require('fs');
const axios = require('axios');
const EventSource = require('eventsource');
const { spawn, exec } = require('child_process');
const path = require('path');

// Configuration
const PANEL_URL = process.env.PANEL_URL || 'http://localhost:8456';
const ENROLL_KEY = process.env.ENROLL_KEY;
const AGENT_ID = process.env.AGENT_ID || 'unknown-agent'; // usually assigned by server
const CONFIG_PATH = process.env.CONFIG_PATH || '/etc/frp/frpc.ini';
const TOKEN_FILE = process.env.TOKEN_FILE || '/data/agent_token';

// State
let agentToken = null;
let agentId = null;
let frpcProcess = null;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    console.log(`[Wrapper] Starting PetalPort Agent...`);

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
        await enroll();
    }

    // 2. Initial Config Pull
    await updateConfig();

    // 3. Start FRPC
    startFrpc();

    // 4. Start SSE & Status Loop
    startSSE();
    startHeartbeat();
}

async function enroll() {
    console.log(`[Wrapper] Enrolling with key...`);
    try {
        const meta = {
            hostname: process.env.HOSTNAME || 'unknown',
            arch: process.arch,
            platform: process.platform
        };

        const res = await axios.post(`${PANEL_URL}/api/agent/enroll`, {
            enrollKey: ENROLL_KEY,
            meta
        });

        agentToken = res.data.token;
        agentId = res.data.agentId;

        // Persist token
        if (!fs.existsSync(path.dirname(TOKEN_FILE))) {
            fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
        }
        fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: agentToken, agentId }));
        console.log(`[Wrapper] Enrolled successfully. ID: ${agentId}`);
    } catch (e) {
        console.error('[Wrapper] Enrollment failed:', e.response?.data || e.message);
        await sleep(5000);
        process.exit(1); // Retry handled by container restart
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
        fs.writeFileSync(CONFIG_PATH, newConfig);
        console.log('[Wrapper] Config updated.');

        // Reload FRPC
        reloadFrpc();
    } catch (e) {
        console.error('[Wrapper] Failed to pull config:', e.message);
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

    es.onerror = (e) => {
        console.error('[Wrapper] SSE Error. Reconnecting...');
        // EventSource autoconnects, but sometimes we need to force
    };
}

function startHeartbeat() {
    setInterval(async () => {
        try {
            await axios.post(`${PANEL_URL}/api/agent/status`, {
                status: 'online',
                meta: {
                    uptime: process.uptime()
                }
            }, {
                headers: { 'Authorization': `Bearer ${agentToken}` }
            });
        } catch (e) {
            // silent fail
        }
    }, 30000); // 30s
}

main();
