<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData, ActionData } from './$types';
    import { toast } from '$lib/stores/toast';

    let { data, form }: { data: PageData, form: ActionData } = $props();

    let showEnrollModal = $state(false);
    let enrollmentKey = $state('');

    const openEnroll = () => {
        showEnrollModal = true;
    };

    // React to form success
    $effect(() => {
        if (form?.success && form?.key) {
            enrollmentKey = form.key;
            showEnrollModal = true;
            toast.success('Enrollment key generated');
        }
    });

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.info('Copied to clipboard');
    };

    let showRenameModal = $state(false);
    let renameAgentId = $state('');
    let renameAgentName = $state('');

    const openRename = (id: string, currentName: string) => {
        renameAgentId = id;
        renameAgentName = currentName;
        showRenameModal = true;
    };

    // Loading states
    let isCreatingKey = $state(false);
    let deletingId = $state<string | null>(null);
    let isRenaming = $state(false);
</script>

<div class="flex justify-between items-center mb-8">
    <h2 class="text-3xl font-bold text-gray-800 dark:text-white">Managed Agents</h2>
    <form method="POST" action="?/createKey" use:enhance={() => {
        isCreatingKey = true;
        return async ({ result, update }) => {
            isCreatingKey = false;
            if (result.type === 'failure') {
                toast.error(String(result.data?.error || 'Failed to create enrollment key'));
            }
            await update();
        };
    }}>
        <button type="submit" disabled={isCreatingKey} class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
            {#if isCreatingKey}
                <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                Generating...
            {:else}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                Connect New Agent
            {/if}
        </button>
    </form>
</div>

<!-- Agents Grid -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each data.agents as agent (agent.id)}
        <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <div class="flex items-center gap-2">
                        <h3 class="font-bold text-lg dark:text-white">{agent.name}</h3>
                        <button onclick={() => openRename(agent.id, agent.name)} class="text-gray-400 hover:text-blue-500" title="Rename Agent">
                           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                    </div>
                    <p class="text-xs text-gray-400 font-mono mt-1">{agent.id.slice(0, 8)}...</p>
                </div>
                <div class="flex items-center gap-2">
                    <div class={`px-2 py-1 text-xs font-bold rounded-full ${agent.status === 'online' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                        {agent.status}
                    </div>
                    <form method="POST" action="?/delete" use:enhance={() => {
                        deletingId = agent.id;
                        return async ({ result, update }) => {
                            deletingId = null;
                            if (result.type === 'success') {
                                toast.success(`Agent "${agent.name}" deleted`);
                            } else if (result.type === 'failure') {
                                toast.error(String(result.data?.error || 'Failed to delete agent'));
                            }
                            await update();
                        };
                    }} class="inline">
                        <input type="hidden" name="id" value={agent.id} />
                        <button type="submit" disabled={deletingId === agent.id} class="text-gray-400 hover:text-red-500 p-1 disabled:opacity-50" title="Delete Agent">
                            {#if deletingId === agent.id}
                                <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                            {:else}
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            {/if}
                        </button>
                    </form>
                </div>
            </div>

            <!-- WireGuard & Tunnel Status -->
            {#if agent.status === 'online'}
                <div class="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <!-- WireGuard Status -->
                    <div class="flex items-center gap-2" title="WireGuard Status">
                        <svg class="w-4 h-4 {agent.wgStatus === 'up' ? 'text-green-500' : 'text-gray-400'}" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                        <span class="text-xs font-medium {agent.wgStatus === 'up' ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}">
                            WG {agent.wgStatus === 'up' ? 'Up' : agent.wgStatus === 'down' ? 'Down' : '?'}
                        </span>
                    </div>

                    <span class="text-gray-300 dark:text-gray-600">|</span>

                    <!-- Tunnel Counts -->
                    <div class="flex items-center gap-3">
                        {#if agent.tunnels?.tcp > 0}
                            <span class="flex items-center gap-1 text-xs">
                                <span class="w-2 h-2 rounded-full bg-purple-500"></span>
                                <span class="text-gray-600 dark:text-gray-300">{agent.tunnels.tcp} TCP</span>
                            </span>
                        {/if}
                        {#if agent.tunnels?.udp > 0}
                            <span class="flex items-center gap-1 text-xs">
                                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                                <span class="text-gray-600 dark:text-gray-300">{agent.tunnels.udp} UDP</span>
                            </span>
                        {/if}
                        {#if (!agent.tunnels?.tcp && !agent.tunnels?.udp)}
                            <span class="text-xs text-gray-400">No tunnels</span>
                        {/if}
                    </div>
                </div>
            {/if}

            <!-- UDP Forward Status (when online and has UDP tunnels) -->
            {#if agent.status === 'online' && agent.udpForwards && agent.udpForwards.length > 0}
                <div class="mb-4 space-y-1">
                    {#each agent.udpForwards as fwd, i (fwd.listenPort)}
                        <div class="flex items-center justify-between text-xs p-2 rounded {fwd.active ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}">
                            <span class="font-mono text-gray-600 dark:text-gray-300">:{fwd.listenPort} → {fwd.localIp}:{fwd.localPort}</span>
                            <span class={fwd.active ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                {fwd.active ? 'Active' : 'Failed'}
                            </span>
                        </div>
                    {/each}
                </div>
            {/if}

            <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <div class="flex justify-between">
                    <span>Host:</span>
                    <span class="font-mono">{agent.meta?.hostname || 'Unknown'}</span>
                </div>
                <div class="flex justify-between">
                    <span>Arch:</span>
                    <span class="font-mono">{agent.meta?.arch || '-'}</span>
                </div>
                <div class="flex justify-between">
                    <span>Last Seen:</span>
                    <span>{agent.lastSeen ? new Date(agent.lastSeen).toLocaleString() : 'Never'}</span>
                </div>
                {#if agent.stats}
                <div class="border-t border-gray-100 dark:border-gray-700 pt-2 mt-2">
                     <div class="flex justify-between text-xs">
                        <span>Traffic In:</span>
                        <span class="font-mono text-gray-700 dark:text-gray-200">{(agent.stats.rx / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    <div class="flex justify-between text-xs">
                        <span>Traffic Out:</span>
                        <span class="font-mono text-gray-700 dark:text-gray-200">{(agent.stats.tx / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                </div>
                {/if}
            </div>
        </div>
    {/each}
</div>

{#if data.agents.length === 0}
    <div class="text-center py-12 text-gray-500 font-medium">
        No agents connected yet. Click "Connect New Agent" to get started.
    </div>
{/if}

<!-- Rename Modal -->
{#if showRenameModal}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => showRenameModal = false}>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-md w-full mx-4" onclick={(e) => e.stopPropagation()}>
            <h3 class="text-lg font-semibold mb-4 dark:text-white">Rename Agent</h3>

            <form method="POST" action="?/rename" use:enhance={() => {
                isRenaming = true;
                return async ({ result, update }) => {
                    isRenaming = false;
                    if (result.type === 'success') {
                        showRenameModal = false;
                        toast.success('Agent renamed successfully');
                    } else if (result.type === 'failure') {
                        toast.error(String(result.data?.error || 'Failed to rename agent'));
                    }
                    await update();
                };
            }}>
                <input type="hidden" name="id" value={renameAgentId} />

                <div class="mb-4">
                    <label for="agentName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Name</label>
                    <input
                        id="agentName"
                        type="text"
                        name="name"
                        value={renameAgentName}
                        required
                        class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>

                <div class="flex justify-end gap-3">
                    <button type="button" onclick={() => showRenameModal = false} class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button type="submit" disabled={isRenaming} class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
                        {#if isRenaming}
                            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                            Saving...
                        {:else}
                            Save
                        {/if}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- Enrollment Modal -->
{#if showEnrollModal && enrollmentKey}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-2xl w-full shadow-2xl relative">
            <button 
                onclick={() => { showEnrollModal = false; enrollmentKey = ''; }}
                class="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                aria-label="Close Modal"
            >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <h3 class="text-2xl font-bold mb-4 dark:text-white">Enrollment Key Generated</h3>
            <p class="text-gray-600 dark:text-gray-300 mb-6">Run the following command on your edge device/server to deploy the agent:</p>
            
            <div class="relative mb-6">
                <pre class="bg-gray-900 text-gray-100 p-6 rounded-lg overflow-x-auto text-sm font-mono custom-scrollbar">{`docker pull ghcr.io/petalcat/petalport-agent:latest

docker run -d \\
  --name petalport-agent \\
  --restart unless-stopped \\
  --network host \\
  --cap-add NET_ADMIN \\
  -e PANEL_URL=${window.location.origin} \\
  -e ENROLL_KEY=${enrollmentKey} \\
  -v petalport_agent_data:/data \\
  ghcr.io/petalcat/petalport-agent:latest`}</pre>
                <button 
                    onclick={() => copyToClipboard(`docker pull ghcr.io/petalcat/petalport-agent:latest\n\ndocker run -d --name petalport-agent --restart unless-stopped --network host --cap-add NET_ADMIN -e PANEL_URL=${window.location.origin} -e ENROLL_KEY=${enrollmentKey} -v petalport_agent_data:/data ghcr.io/petalcat/petalport-agent:latest`)}
                    class="absolute top-4 right-4 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded opacity-90 transition-opacity"
                    aria-label="Copy Command"
                >
                    Copy
                </button>
            </div>
            
            <div class="bg-yellow-50 dark:bg-yellow-900/30 border-l-4 border-yellow-400 p-4">
                <div class="flex">
                    <div class="ml-3">
                        <p class="text-sm text-yellow-700 dark:text-yellow-200">
                            This key expires in 30 minutes and can only be used once.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}
