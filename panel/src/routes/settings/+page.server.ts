import { fail } from '@sveltejs/kit';
import { getSettings, updateSettings } from '$lib/server/settings';
import { getProxies, syncConfig as syncFrp } from '$lib/server/frp';

export const load = async () => {
    const settings = await getSettings();
    return {
        settings
    };
};

export const actions = {
    default: async ({ request }) => {
        const data = await request.formData();
        const serverEndpoint = data.get('serverEndpoint') as string;
        const frpServerAddr = data.get('frpServerAddr') as string;
        const frpAuthToken = data.get('frpAuthToken') as string;

        if (!serverEndpoint || !frpServerAddr) {
            return fail(400, { missing: true });
        }

        const updated = await updateSettings({
            serverEndpoint,
            frpServerAddr,
            frpAuthToken: frpAuthToken || undefined
        });

        // Trigger config syncs to apply new settings
        const proxies = await getProxies();
        await syncFrp(proxies);
        // Note: WireGuard server config doesn't use these settings directly mostly, 
        // but client config generation does (which is read time).
        // If we stored WG private key in settings we'd need to sync that too.

        return { success: true };
    }
};
