<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData, ActionData } from './$types';
    import { toast } from '$lib/stores/toast';

    let { data, form }: { data: PageData, form: ActionData } = $props();

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    let showMigrateModal = $state(false);
    let migrateProxyId = $state('');
    let migrateProxyName = $state('');

    const openMigrate = (id: string, name: string) => {
        migrateProxyId = id;
        migrateProxyName = name;
        showMigrateModal = true;
    };

    // Edit modal state
    let showEditModal = $state(false);
    let editProxy = $state<{ id: string; name: string; localIp: string; localPort: number; bindPort: number; type: string } | null>(null);

    const openEdit = (proxy: typeof editProxy) => {
        editProxy = proxy ? { ...proxy } : null;
        showEditModal = true;
    };

    // Advanced options toggle
    let showAdvanced = $state(false);

    // Loading states
    let isCreating = $state(false);
    let deletingId = $state<string | null>(null);
    let isMigrating = $state(false);
    let isEditing = $state(false);

    // Helper to get status color and icon for UDP forwards
    function getUdpStatusInfo(proxy: any) {
        if (proxy.type !== 'udp') return null;

        const agent = data.agents.find(a => a.id === proxy.agentId);
        if (!agent) return { status: 'unknown', color: 'gray', text: 'Agent offline' };
        if (agent.status !== 'online') return { status: 'offline', color: 'gray', text: 'Agent offline' };
        if (agent.wgStatus !== 'up') return { status: 'wg-down', color: 'yellow', text: 'WireGuard down' };

        if (proxy.udpStatus) {
            if (proxy.udpStatus.active) {
                return { status: 'active', color: 'green', text: 'Forwarding active' };
            } else {
                return { status: 'error', color: 'red', text: proxy.udpStatus.error || 'Setup failed' };
            }
        }

        return { status: 'pending', color: 'yellow', text: 'Pending setup' };
    }
</script>

<div class="flex justify-between items-center mb-8">
    <h2 class="text-3xl font-bold text-gray-800 dark:text-white">Tunnels</h2>
</div>

<!-- Error Display -->
{#if form?.error}
    <div class="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
        <p class="text-red-700 dark:text-red-300 text-sm">{form.error}</p>
    </div>
{/if}

<!-- Add Proxy Form -->
<form method="POST" action="?/create" use:enhance={() => {
    isCreating = true;
    return async ({ result, update }) => {
        isCreating = false;
        if (result.type === 'success') {
            toast.success('Tunnel created successfully');
        } else if (result.type === 'failure') {
            toast.error(String(result.data?.error || 'Failed to create tunnel'));
        }
        await update();
    };
}} class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm mb-8 border border-gray-200 dark:border-gray-700">
    <h3 class="text-lg font-semibold mb-4 dark:text-white">New Tunnel</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end mb-4">
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
                {#each data.agents as agent (agent.id)}
                    <option value={agent.id}>{agent.name} ({agent.status})</option>
                {/each}
            </select>
        </div>
        <div>
            <label for="type" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Protocol</label>
            <select id="type" name="type" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none">
                <option value="tcp">TCP (FRP)</option>
                <option value="udp">UDP (WireGuard)</option>
            </select>
        </div>
        <div>
            <label for="localAddress" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Service Address
                <span class="text-gray-400 text-xs ml-1">(on agent)</span>
            </label>
            <input
                id="localAddress"
                type="text"
                name="localAddress"
                placeholder="127.0.0.1:25565 or just 25565"
                required
                class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none font-mono text-sm"
            />
        </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
            <label for="bindPort" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Public Port
                <span class="text-gray-400 text-xs ml-1">(on server)</span>
            </label>
            <input
                id="bindPort"
                type="number"
                name="bindPort"
                placeholder="e.g. 25565"
                required
                min="1"
                max="65535"
                class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
            />
        </div>
        <div class="lg:col-span-2">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Traffic to <span class="font-mono text-purple-600 dark:text-purple-400">server:&lbrace;bindPort&rbrace;</span> will be forwarded to <span class="font-mono text-green-600 dark:text-green-400">&lbrace;serviceAddress&rbrace;</span> on the agent's network.
            </p>
        </div>
        <button type="submit" disabled={isCreating} class="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium rounded-lg transition-colors h-fit flex items-center gap-2">
            {#if isCreating}
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                Creating...
            {:else}
                Create Tunnel
            {/if}
        </button>
    </div>
</form>

<!-- Tunnels List -->
{#if data.proxies.length === 0}
    <div class="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <svg class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
        <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No tunnels configured</h3>
        <p class="text-gray-500 dark:text-gray-400 mb-4">Create a tunnel to expose services from your agents to the internet.</p>
    </div>
{:else}
    <div class="grid gap-4">
        {#each data.proxies as proxy (proxy.id)}
            {@const udpStatus = getUdpStatusInfo(proxy)}
            {@const agent = data.agents.find(a => a.id === proxy.agentId)}
            <div class="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <!-- Protocol Badge -->
                        <div class="flex flex-col items-center gap-1">
                            <div class="flex items-center justify-center w-12 h-12 rounded-lg {proxy.type === 'udp' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'} font-bold text-xs uppercase">
                                {proxy.type}
                            </div>
                            {#if proxy.type === 'udp'}
                                <span class="text-[10px] text-gray-400">WireGuard</span>
                            {:else}
                                <span class="text-[10px] text-gray-400">FRP</span>
                            {/if}
                        </div>

                        <!-- Tunnel Info -->
                        <div class="flex-1">
                            <div class="flex items-center gap-2">
                                <h4 class="font-bold text-gray-900 dark:text-white">{proxy.name}</h4>
                                {#if udpStatus}
                                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                                        {udpStatus.color === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : ''}
                                        {udpStatus.color === 'yellow' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
                                        {udpStatus.color === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : ''}
                                        {udpStatus.color === 'gray' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' : ''}
                                    " title={udpStatus.text}>
                                        {#if udpStatus.status === 'active'}
                                            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                                        {:else if udpStatus.status === 'error'}
                                            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>
                                        {:else}
                                            <svg class="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3"/></svg>
                                        {/if}
                                        {udpStatus.status === 'active' ? 'Active' : udpStatus.status === 'error' ? 'Error' : 'Pending'}
                                    </span>
                                {/if}
                            </div>
                            <div class="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                                <span class="font-mono flex items-center gap-1">
                                    <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>
                                    :{proxy.bindPort}
                                </span>
                                <span class="text-gray-300 dark:text-gray-600">→</span>
                                <span class="font-mono text-green-600 dark:text-green-400">{proxy.localIp}:{proxy.localPort}</span>
                                <span class="text-gray-300 dark:text-gray-600">•</span>
                                <span class="text-gray-400">{agent?.name || 'Unknown Agent'}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center gap-2">
                        <button onclick={() => openEdit(proxy)} class="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors" title="Edit tunnel">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>

                        <button onclick={() => openMigrate(proxy.id, proxy.name)} class="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Migrate to another agent">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                        </button>

                        <form method="POST" action="?/delete" use:enhance={() => {
                            deletingId = proxy.id;
                            return async ({ result, update }) => {
                                deletingId = null;
                                if (result.type === 'success') {
                                    toast.success(`Tunnel "${proxy.name}" deleted`);
                                } else if (result.type === 'failure') {
                                    toast.error(String(result.data?.error || 'Failed to delete tunnel'));
                                }
                                await update();
                            };
                        }} class="inline">
                            <input type="hidden" name="id" value={proxy.id} />
                            <button type="submit" disabled={deletingId === proxy.id} class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50" title="Delete tunnel">
                                {#if deletingId === proxy.id}
                                    <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                                {:else}
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                {/if}
                            </button>
                        </form>
                    </div>
                </div>

                <!-- UDP Error Details -->
                {#if udpStatus?.status === 'error' && udpStatus.text}
                    <div class="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                        <p class="text-xs text-red-600 dark:text-red-400 font-mono">{udpStatus.text}</p>
                    </div>
                {/if}
            </div>
        {/each}
    </div>
{/if}

<!-- Migrate Modal -->
{#if showMigrateModal}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => showMigrateModal = false}>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-md w-full mx-4" onclick={(e) => e.stopPropagation()}>
            <h3 class="text-lg font-semibold mb-4 dark:text-white">Migrate Tunnel</h3>
            <p class="text-gray-600 dark:text-gray-400 mb-4">Move <strong>{migrateProxyName}</strong> to a different agent:</p>

            <form method="POST" action="?/migrate" use:enhance={() => {
                isMigrating = true;
                return async ({ result, update }) => {
                    isMigrating = false;
                    if (result.type === 'success') {
                        showMigrateModal = false;
                        toast.success(`Tunnel "${migrateProxyName}" migrated successfully`);
                    } else if (result.type === 'failure') {
                        toast.error(String(result.data?.error || 'Failed to migrate tunnel'));
                    }
                    await update();
                };
            }}>
                <input type="hidden" name="id" value={migrateProxyId} />

                <select name="agentId" required class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none mb-4">
                    <option value="" disabled selected>Select target agent</option>
                    {#each data.agents as agent (agent.id)}
                        <option value={agent.id}>{agent.name} ({agent.status})</option>
                    {/each}
                </select>

                <div class="flex justify-end gap-3">
                    <button type="button" onclick={() => showMigrateModal = false} class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button type="submit" disabled={isMigrating} class="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
                        {#if isMigrating}
                            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                            Migrating...
                        {:else}
                            Migrate
                        {/if}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- Edit Modal -->
{#if showEditModal && editProxy}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => showEditModal = false}>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-lg w-full mx-4" onclick={(e) => e.stopPropagation()}>
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold dark:text-white">Edit Tunnel</h3>
                <span class="px-2 py-1 text-xs font-bold rounded {editProxy.type === 'udp' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'} uppercase">
                    {editProxy.type}
                </span>
            </div>

            <form method="POST" action="?/edit" use:enhance={() => {
                isEditing = true;
                return async ({ result, update }) => {
                    isEditing = false;
                    if (result.type === 'success') {
                        showEditModal = false;
                        toast.success('Tunnel updated successfully');
                        editProxy = null;
                    } else if (result.type === 'failure') {
                        toast.error(String(result.data?.error || 'Failed to update tunnel'));
                    }
                    await update();
                };
            }}>
                <input type="hidden" name="id" value={editProxy.id} />

                <div class="space-y-4">
                    <div>
                        <label for="editName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                        <input
                            id="editName"
                            type="text"
                            name="name"
                            value={editProxy.name}
                            required
                            class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>

                    <div>
                        <label for="editLocalAddress" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Service Address
                            <span class="text-gray-400 text-xs ml-1">(on agent)</span>
                        </label>
                        <input
                            id="editLocalAddress"
                            type="text"
                            name="localAddress"
                            value="{editProxy.localIp}:{editProxy.localPort}"
                            required
                            placeholder="127.0.0.1:25565"
                            class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none font-mono text-sm"
                        />
                    </div>

                    <div>
                        <label for="editBindPort" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Public Port
                            <span class="text-gray-400 text-xs ml-1">(on server)</span>
                        </label>
                        <input
                            id="editBindPort"
                            type="number"
                            name="bindPort"
                            value={editProxy.bindPort}
                            required
                            min="1"
                            max="65535"
                            class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>
                </div>

                <div class="flex justify-end gap-3 mt-6">
                    <button type="button" onclick={() => { showEditModal = false; editProxy = null; }} class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button type="submit" disabled={isEditing} class="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
                        {#if isEditing}
                            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                            Saving...
                        {:else}
                            Save Changes
                        {/if}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}




