<script lang="ts">
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<h2 class="text-3xl font-bold mb-8 text-gray-800 dark:text-white">System Status</h2>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each data.containers as container}
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white truncate" title={container.Names[0]}>
                    {container.Names[0].replace('/', '')}
                </h3>
                <span class={`px-3 py-1 text-xs font-bold rounded-full ${container.State === 'running' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {container.State.toUpperCase()}
                </span>
            </div>
            <div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <p>Image: {container.Image}</p>
                <p>Status: {container.Status}</p>
            </div>
        </div>
    {/each}
</div>

{#if data.containers.length === 0}
    <div class="text-center text-gray-500 mt-12">
        <p>No PetalPort services detected.</p>
        <p class="text-sm">Make sure containers are named with 'petalport' prefix.</p>
    </div>
{/if}
