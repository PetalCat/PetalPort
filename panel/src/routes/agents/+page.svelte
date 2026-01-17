<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData, ActionData } from './$types';

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
            showEnrollModal = true; // Ensure modal is open if action returns key
        }
    });

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };
</script>

<div class="flex justify-between items-center mb-8">
    <h2 class="text-3xl font-bold text-gray-800 dark:text-white">Managed Agents</h2>
    <form method="POST" action="?/createKey" use:enhance>
        <button type="submit" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            Connect New Agent
        </button>
    </form>
</div>

<!-- Agents Grid -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each data.agents as agent (agent.id)}
        <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="font-bold text-lg dark:text-white">{agent.name}</h3>
                    <p class="text-xs text-gray-400 font-mono mt-1">{agent.id}</p>
                </div>
                <div class={`px-2 py-1 text-xs font-bold rounded-full ${agent.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {agent.status}
                </div>
            </div>
            
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
            </div>
        </div>
    {/each}
</div>

{#if data.agents.length === 0}
    <div class="text-center py-12 text-gray-500 font-medium">
        No agents connected yet. Click "Connect New Agent" to get started.
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
  ghcr.io/petalcat/petalport-agent:latest`}</pre>
                <button 
                    onclick={() => copyToClipboard(`docker pull ghcr.io/petalcat/petalport-agent:latest\n\ndocker run -d --name petalport-agent --restart unless-stopped --network host --cap-add NET_ADMIN -e PANEL_URL=${window.location.origin} -e ENROLL_KEY=${enrollmentKey} ghcr.io/petalcat/petalport-agent:latest`)}
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
