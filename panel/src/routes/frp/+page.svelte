<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // Show toast?
    };

    let showMigrateModal = $state(false);
    let migrateProxyId = $state('');
    let migrateProxyName = $state('');
    let migrateTargetAgent = $state(''); // Unused locally, just for form? No, need to bind select potentially or just let form handle it.

    const openMigrate = (id: string, name: string) => {
        migrateProxyId = id;
        migrateProxyName = name;
        showMigrateModal = true;
    };
</script>

<div class="flex justify-between items-center mb-8">
    <h2 class="text-3xl font-bold text-gray-800 dark:text-white">FRP Tunnels</h2>
</div>

<!-- Add Proxy Form -->
<form method="POST" action="?/create" use:enhance class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm mb-8 border border-gray-200 dark:border-gray-700">
    <h3 class="text-lg font-semibold mb-4 dark:text-white">New Tunnel</h3>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
        <div>
            <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input 
                id="name"
                type="text" 
                name="name" 
                placeholder="e.g. Minecraft Server" 
                required
                class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
            />
        </div>
        <div>
            <label for="agentId" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent</label>
            <select id="agentId" name="agentId" required class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none">
                <option value="" disabled selected>Select an Agent</option>
                {#each data.agents as agent}
                    <option value={agent.id}>{agent.name} ({agent.status})</option>
                {/each}
            </select>
        </div>
        <div>
            <label for="type" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select id="type" name="type" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none">
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
            </select>
        </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
            <label for="localPort" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Local Port (on Agent)</label>
            <input 
                id="localPort"
                type="number" 
                name="localPort" 
                placeholder="e.g. 25565" 
                required
                class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
            />
        </div>
        <div>
            <label for="bindPort" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Remote Port (on Server)</label>
            <input 
                id="bindPort"
                type="number" 
                name="bindPort" 
                placeholder="e.g. 25565" 
                required
                class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
            />
        </div>
        <button type="submit" class="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors h-fit">
            Create Tunnel
        </button>
    </div>
</form>

<!-- Tunnels List -->
<div class="grid gap-4">
    {#each data.proxies as proxy (proxy.id)}
        <div class="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div class="flex items-center gap-4">
                <div class="flex items-center justify-center w-10 h-10 rounded-lg {proxy.type === 'udp' ? 'bg-green-100 text-green-600' : 'bg-purple-100 text-purple-600'} font-bold text-xs uppercase">
                    {proxy.type}
                </div>
                <div>
                    <h4 class="font-bold text-gray-900 dark:text-white">{proxy.name}</h4>
                    <p class="text-sm text-gray-500 font-mono">
                        Port: {proxy.bindPort}
                        {proxy.agentId ? `• Agent: ${data.agents.find(a => a.id === proxy.agentId)?.name || 'Unknown'}` : ''}
                        {#if proxy.type === 'udp'}
                            <span class="text-green-600 dark:text-green-400"> • WireGuard</span>
                        {/if}
                    </p>
                </div>
            </div>

            <div class="flex items-center gap-3">

                <button onclick={() => openMigrate(proxy.id, proxy.name)} class="text-gray-500 hover:text-blue-600 mr-2" title="Migrate" aria-label="Migrate">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                </button>

                <form method="POST" action="?/delete" use:enhance class="inline">
                    <input type="hidden" name="id" value={proxy.id} />
                    <button type="submit" class="text-gray-500 hover:text-red-600" title="Delete" aria-label="Delete">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </form>
            </div>
        </div>
    {/each}
</div>

<!-- Migrate Modal -->
{#if showMigrateModal}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => showMigrateModal = false}>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-md w-full mx-4" onclick={(e) => e.stopPropagation()}>
            <h3 class="text-lg font-semibold mb-4 dark:text-white">Migrate Tunnel</h3>
            <p class="text-gray-600 dark:text-gray-400 mb-4">Move <strong>{migrateProxyName}</strong> to a different agent:</p>

            <form method="POST" action="?/migrate" use:enhance={() => {
                return async ({ result, update }) => {
                    if (result.type === 'success') {
                        showMigrateModal = false;
                    }
                    await update();
                };
            }}>
                <input type="hidden" name="id" value={migrateProxyId} />

                <select name="agentId" required class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none mb-4">
                    <option value="" disabled selected>Select target agent</option>
                    {#each data.agents as agent}
                        <option value={agent.id}>{agent.name} ({agent.status})</option>
                    {/each}
                </select>

                <div class="flex justify-end gap-3">
                    <button type="button" onclick={() => showMigrateModal = false} class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button type="submit" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors">
                        Migrate
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}




