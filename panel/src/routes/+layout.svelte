<script>
	import './styles.css';
	import Toast from '$lib/components/Toast.svelte';
    let { children } = $props();
</script>

<div class="flex h-screen bg-gray-100 dark:bg-gray-900 front">
	<!-- Sidebar -->
	<aside class="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 hidden md:flex flex-col">
		<div class="p-6 border-b border-gray-200 dark:border-gray-700">
			<h1 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
				PetalPort
			</h1>
		</div>
		<nav class="flex-1 p-4 space-y-2">
			<a href="/" class="flex items-center px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
				<span class="mr-3">📊</span>
				Dashboard
			</a>
			<a href="/wireguard" class="flex items-center px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
				<span class="mr-3">🔒</span>
				WireGuard
			</a>
			<a href="/agents" class="flex items-center px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
				<span class="mr-3">🤖</span>
				Agents
			</a>
			<a href="/frp" class="flex items-center px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
				<span class="mr-3">🌐</span>
				FRP Tunnels
			</a>
			<a href="/settings" class="flex items-center px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
				<span class="mr-3">⚙️</span>
				Settings
			</a>
		</nav>
	</aside>

	<!-- Main Content -->
	<main class="flex-1 overflow-y-auto p-8">
		{@render children()}
	</main>
</div>

<Toast />
