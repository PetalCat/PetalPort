<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<div class="flex justify-between items-center mb-8">
    <h2 class="text-3xl font-bold text-gray-800 dark:text-white">System Settings</h2>
</div>

<form method="POST" use:enhance class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 max-w-2xl">
    <div class="space-y-6">
        <div>
            <label for="serverEndpoint" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">WireGuard Endpoint</label>
            <p class="text-xs text-gray-500 mb-2">Public IP:Port for WireGuard VPN clients (e.g., 192.0.2.1:51820).</p>
            <input 
                id="serverEndpoint"
                type="text" 
                name="serverEndpoint" 
                value={data.settings.serverEndpoint}
                required
                placeholder="192.0.2.1:51820"
                class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
        </div>

        <div>
            <label for="frpServerAddr" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">FRP Server Address</label>
            <p class="text-xs text-gray-500 mb-2">Public IP or hostname where agents connect to FRP (e.g., 192.0.2.1). Port 7000 is used by default.</p>
            <input 
                id="frpServerAddr"
                type="text" 
                name="frpServerAddr" 
                value={data.settings.frpServerAddr || ''}
                required
                placeholder="192.0.2.1"
                class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
        </div>

        <div>
            <label for="frpAuthToken" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">FRP Auth Token</label>
            <p class="text-xs text-gray-500 mb-2">Optional secret token for FRP agents. If set, agents must provide this token.</p>
            <input 
                id="frpAuthToken"
                type="text" 
                name="frpAuthToken" 
                value={data.settings.frpAuthToken || ''}
                placeholder="Leave empty to disable auth"
                class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
            />
        </div>

        <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="submit" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
                Save Changes
            </button>
        </div>
    </div>
</form>
