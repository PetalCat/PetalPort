import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';

const CONFIG_ROOT = env.CONFIG_ROOT || '/config';
const AGENTS_FILE = path.join(CONFIG_ROOT, 'agents.json');
const ENROLL_KEYS_FILE = path.join(CONFIG_ROOT, 'enrollment_keys.json');

export interface Agent {
    id: string;
    name: string;
    token: string; // Secret token used by agent to authenticate
    status: 'online' | 'offline';
    lastSeen?: string;
    meta?: {
        hostname?: string;
        arch?: string;
        version?: string;
    };
    configHash?: string; // Hash of last pushed config
}

interface EnrollmentKey {
    key: string;
    expiresAt: number;
    used: boolean;
}

// Helper to ensure file exists
const ensureFile = async (filePath: string, defaultContent: any) => {
    try {
        await fs.access(filePath);
    } catch {
        await fs.writeFile(filePath, JSON.stringify(defaultContent, null, 2));
    }
};

export const getAgents = async (): Promise<Agent[]> => {
    await ensureFile(AGENTS_FILE, []);
    const data = await fs.readFile(AGENTS_FILE, 'utf-8');
    try {
        return JSON.parse(data);
    } catch {
        return [];
    }
};

export const saveAgents = async (agents: Agent[]) => {
    await fs.writeFile(AGENTS_FILE, JSON.stringify(agents, null, 2));
};

const getEnrollmentKeys = async (): Promise<EnrollmentKey[]> => {
    await ensureFile(ENROLL_KEYS_FILE, []);
    const data = await fs.readFile(ENROLL_KEYS_FILE, 'utf-8');
    try {
        return JSON.parse(data);
    } catch {
        return [];
    }
};

const saveEnrollmentKeys = async (keys: EnrollmentKey[]) => {
    await fs.writeFile(ENROLL_KEYS_FILE, JSON.stringify(keys, null, 2));
};

export const createEnrollmentKey = async (ttlMinutes = 30): Promise<string> => {
    const key = crypto.randomBytes(16).toString('hex');
    const existing = await getEnrollmentKeys();

    // Clean up expired keys
    const now = Date.now();
    const valid = existing.filter(k => k.expiresAt > now);

    valid.push({
        key,
        expiresAt: now + (ttlMinutes * 60 * 1000),
        used: false
    });

    await saveEnrollmentKeys(valid);
    return key;
};

export const redeemEnrollmentKey = async (key: string, meta: Agent['meta']): Promise<Agent | null> => {
    const keys = await getEnrollmentKeys();
    const now = Date.now();
    const keyIdx = keys.findIndex(k => k.key === key && !k.used && k.expiresAt > now);

    if (keyIdx === -1) return null;

    // Mark key as used
    keys[keyIdx].used = true;
    await saveEnrollmentKeys(keys);

    // Create new agent
    const agentToken = crypto.randomBytes(32).toString('hex');
    const agentId = crypto.randomUUID();

    const newAgent: Agent = {
        id: agentId,
        name: meta?.hostname || `Agent-${agentId.slice(0, 8)}`,
        token: agentToken,
        status: 'online',
        lastSeen: new Date().toISOString(),
        meta
    };

    const agents = await getAgents();
    agents.push(newAgent);
    await saveAgents(agents);

    return newAgent;
};

export const validateAgentToken = async (token: string): Promise<Agent | null> => {
    const agents = await getAgents();
    return agents.find(a => a.token === token) || null;
};

export const updateAgentStatus = async (id: string, status: 'online' | 'offline', meta?: Agent['meta']) => {
    const agents = await getAgents();
    const agent = agents.find(a => a.id === id);
    if (agent) {
        agent.status = status;
        agent.lastSeen = new Date().toISOString();
        if (meta) agent.meta = { ...agent.meta, ...meta };
        await saveAgents(agents);
    }
};
