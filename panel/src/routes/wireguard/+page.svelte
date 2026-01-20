<script lang="ts">
    import { enhance } from '$app/forms';
    import QRCode from 'qrcode';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    
    let showConfigModal = $state(false);
    let selectedPeer = $state<any>(null);
    let qrUrl = $state('');

    const openConfig = async (peer: any) => {
        selectedPeer = peer;
        const configText = `[Interface]
PrivateKey = ${peer.privateKey || 'HIDDEN'}
Address = ${peer.allowedIps.split('/')[0]}/24
DNS = 1.1.1.1

[Peer]
PublicKey = ${data.serverPublicKey}
Endpoint = ${data.serverEndpoint}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25`;

        try {
            qrUrl = await QRCode.toDataURL(configText);
        } catch (err) {
            console.error(err);
        }
        showConfigModal = true;
    };
</script>

<div class="flex justify-between items-center mb-8">
    <h2 class="text-3xl font-bold text-gray-800 dark:text-white">WireGuard Peers</h2>
</div>

<!-- Add Peer Form -->
<form method="POST" action="?/create" use:enhance class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm mb-8 border border-gray-200 dark:border-gray-700 max-w-lg">
    <h3 class="text-lg font-semibold mb-4 dark:text-white">Add New Client</h3>
    <div class="flex gap-4">
        <input 
            type="text" 
            name="name" 
            placeholder="Client Name (e.g. My iPhone)" 
            required
            class="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button type="submit" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
            Create
        </button>
    </div>
</form>

<!-- Peers List -->
<div class="grid gap-4">
    {#each data.peers as peer (peer.id)}
        <div class="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div class="flex items-center gap-4">
                <div class={`w-3 h-3 rounded-full ${peer.enabled ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                <div>
                    <div class="flex items-center gap-2">
                        <h4 class="font-bold text-gray-900 dark:text-white">{peer.name}</h4>
                        {#if peer.isDevice}
                            <span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded-full">Device</span>
                        {:else}
                            <span class="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 rounded-full">Agent</span>
                        {/if}
                    </div>
                    <p class="text-sm text-gray-500 font-mono">{peer.allowedIps}</p>
                </div>
            </div>
            
            <div class="flex items-center gap-3">
                <button 
                    onclick={() => openConfig(peer)}
                    class="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    aria-label="Show Configuration"
                >
                    Show Config
                </button>
                
                <form method="POST" action="?/toggle" use:enhance class="inline">
                    <input type="hidden" name="id" value={peer.id} />
                    <button type="submit" class="text-gray-500 hover:text-blue-600" aria-label={peer.enabled ? 'Disable' : 'Enable'} title={peer.enabled ? 'Disable' : 'Enable'}>
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </button>
                </form>

                <form method="POST" action="?/delete" use:enhance class="inline">
                    <input type="hidden" name="id" value={peer.id} />
                    <button type="submit" class="text-gray-500 hover:text-red-600" aria-label="Delete" title="Delete">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </form>
            </div>
        </div>
    {/each}
</div>

<!-- Config Modal -->
{#if showConfigModal && selectedPeer}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl relative">
            <button 
                onclick={() => showConfigModal = false}
                class="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                aria-label="Close Modal"
            >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <h3 class="text-xl font-bold mb-4 dark:text-white text-center">{selectedPeer.name}</h3>
            
            <div class="flex justify-center mb-6">
                <img src={qrUrl} alt="QR Code" class="w-64 h-64 rounded-lg border-4 border-white shadow-lg" />
            </div>
            
            <div class="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-xs font-mono text-gray-800 dark:text-gray-200 mb-6 max-h-48 custom-scrollbar">
                <pre>{`[Interface]
PrivateKey = ${selectedPeer.privateKey}
Address = ${selectedPeer.allowedIps.split('/')[0]}/24
DNS = 1.1.1.1

[Peer]
PublicKey = ${data.serverPublicKey}
Endpoint = ${data.serverEndpoint}
AllowedIPs = 0.0.0.0/0, ::/0`}</pre>
            </div>
        </div>
    </div>
{/if}
