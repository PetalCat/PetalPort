<script>
    import { page } from '$app/stores';
</script>

<div class="space-y-6">
    <div class="flex items-center space-x-4 border-b border-gray-200 dark:border-gray-700 pb-2">
        <a 
            href="/settings" 
            class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {$page.url.pathname === '/settings' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}"
        >
            System
        </a>
        <a 
            href="/settings/security" 
            class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {$page.url.pathname.includes('/settings/security') ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}"
        >
            Security
        </a>
    </div>

    <slot />
</div>
