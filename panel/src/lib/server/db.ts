import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { compare, hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const CONFIG_ROOT = env.CONFIG_ROOT || '/config';
const USERS_FILE = path.join(CONFIG_ROOT, 'users.json');
const SETTINGS_FILE = path.join(CONFIG_ROOT, 'settings.json');

export interface User {
    id: string;
    username: string;
    passwordHash: string;
    role: 'admin' | 'user'; // For now, first user is admin, others might be regular
    mfaSecret?: string;
    mfaEnabled: boolean;
    createdAt: string;
}

export interface Settings {
    signupLocked: boolean;
    mfaEnforced: boolean;
}

const DEFAULT_SETTINGS: Settings = {
    signupLocked: false,
    mfaEnforced: false
};

// --- Users ---

export const getUsers = async (): Promise<User[]> => {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
};

export const saveUsers = async (users: User[]) => {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
};

export const createUser = async (username: string, password: string): Promise<User> => {
    const users = await getUsers();

    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        throw new Error('Username already exists');
    }

    const passwordHash = await hash(password, 10);
    const isFirstUser = users.length === 0;

    const newUser: User = {
        id: randomUUID(),
        username,
        passwordHash,
        role: isFirstUser ? 'admin' : 'user',
        mfaEnabled: false,
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    await saveUsers(users);

    // If this was the first user, auto-lock signups for security? 
    // The requirement says "add settings to lock signups", implying it might be manual?
    // But usually "First user is admin" implies we lock after.
    // Let's NOT auto-lock initially to allow inviting others easily, unless user chooses to lock.
    // Or better, let's leave it open but user can lock it. 
    // Actually, "First user is admin" implementation often implies subsequent signups are disabled or require approval.
    // Let's stick to default settings (open) but update the store so the file exists.
    if (isFirstUser) {
        await updateSettings({}); // Ensure settings file exists
    }

    return newUser;
};

export const validateUser = async (username: string, password: string): Promise<User | null> => {
    const users = await getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) return null;

    const valid = await compare(password, user.passwordHash);
    if (!valid) return null;

    return user;
};

export const getUserById = async (id: string): Promise<User | null> => {
    const users = await getUsers();
    return users.find(u => u.id === id) || null;
};

export const updateUser = async (id: string, updates: Partial<User>) => {
    const users = await getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('User not found');

    users[index] = { ...users[index], ...updates };
    await saveUsers(users);
    return users[index];
};

// --- Settings ---

export const getSettings = async (): Promise<Settings> => {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch {
        return DEFAULT_SETTINGS;
    }
};

export const updateSettings = async (updates: Partial<Settings>) => {
    const current = await getSettings();
    const updated = { ...current, ...updates };
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(updated, null, 2), { mode: 0o600 });
    return updated;
};

// --- Sessions ---

const SESSIONS_FILE = path.join(CONFIG_ROOT, 'sessions.json');

export interface Session {
    id: string;
    userId: string;
    expiresAt: string;
}

export const getSessions = async (): Promise<Session[]> => {
    try {
        const data = await fs.readFile(SESSIONS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
};

export const saveSessions = async (sessions: Session[]) => {
    await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), { mode: 0o600 });
};

export const createSession = async (userId: string): Promise<string> => {
    const sessions = await getSessions();
    const sessionId = randomUUID();

    // 7 days expiration
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    sessions.push({
        id: sessionId,
        userId,
        expiresAt
    });

    await saveSessions(sessions);
    return sessionId;
};

export const getSession = async (sessionId: string): Promise<Session | null> => {
    const sessions = await getSessions();
    const session = sessions.find(s => s.id === sessionId);

    if (!session) return null;

    if (new Date(session.expiresAt) < new Date()) {
        await deleteSession(sessionId);
        return null;
    }

    return session;
};

export const deleteSession = async (sessionId: string) => {
    let sessions = await getSessions();
    sessions = sessions.filter(s => s.id !== sessionId);
    await saveSessions(sessions);
};
