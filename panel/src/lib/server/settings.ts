import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';

const CONFIG_ROOT = env.CONFIG_ROOT || '/config';
const SETTINGS_FILE = path.join(CONFIG_ROOT, 'settings.json');

export interface SystemSettings {
    serverEndpoint: string;
    frpAuthToken?: string;
    frpServerPort: number;
}

const DEFAULT_SETTINGS: SystemSettings = {
    serverEndpoint: 'vpn.example.com:51820',
    frpServerPort: 7000
};

export const getSettings = async (): Promise<SystemSettings> => {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch (e) {
        return DEFAULT_SETTINGS;
    }
};

export const updateSettings = async (settings: Partial<SystemSettings>) => {
    const current = await getSettings();
    const updated = { ...current, ...settings };
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(updated, null, 2));
    return updated;
};
