<script lang="ts">
	import { enhance } from '$app/forms';
	export let data;
	export let form;
</script>

<div class="p-6">
	<h1 class="text-2xl font-bold mb-6 text-white">Security Settings</h1>

	{#if form?.error}
		<div class="p-4 mb-4 text-sm text-red-500 bg-red-900/20 border border-red-500/50 rounded-lg">
			{form.error}
		</div>
	{/if}
    
    {#if form?.success}
		<div class="p-4 mb-4 text-sm text-green-500 bg-green-900/20 border border-green-500/50 rounded-lg">
			{form.success}
		</div>
	{/if}

	<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
		<!-- Admin Settings -->
		{#if data.user.role === 'admin'}
			<div class="bg-gray-800 p-6 rounded-lg shadow-lg">
				<h2 class="text-xl font-semibold mb-4 text-primary-400">Admin Controls</h2>
				<form method="POST" action="?/updateSettings" use:enhance class="space-y-4">
					<div class="flex items-center justify-between">
						<label for="signupLocked" class="text-gray-300">Lock Signups</label>
						<input
							type="checkbox"
							id="signupLocked"
							name="signupLocked"
                            checked={data.settings.signupLocked}
                            value="true"
							class="w-5 h-5 bg-gray-700 border-gray-600 rounded focus:ring-primary-500 focus:ring-offset-gray-800"
						/>
					</div>
                    <p class="text-xs text-gray-500">Prevent new users from registering.</p>

					<button
						type="submit"
						class="w-full py-2 px-4 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-lg shadow-md transition-all"
					>
						Save Admin Settings
					</button>
				</form>
			</div>
		{/if}

		<!-- User MFA Settings -->
		<div class="bg-gray-800 p-6 rounded-lg shadow-lg">
			<h2 class="text-xl font-semibold mb-4 text-primary-400">Two-Factor Authentication</h2>
            
            {#if data.user.mfaEnabled}
                 <div class="text-green-400 mb-4 flex items-center gap-2">
                    <span class="w-3 h-3 bg-green-500 rounded-full"></span>
                    MFA is Enabled
                </div>
                 <form method="POST" action="?/disableMfa" use:enhance>
                    <button
						type="submit"
						class="w-full py-2 px-4 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg shadow-md transition-all"
					>
						Disable MFA
					</button>
                 </form>
            {:else}
                 <p class="text-gray-400 mb-4">Protect your account with an Authenticator App.</p>
                 
                 {#if form?.qrCode}
                    <div class="mb-4 text-center">
                        <img src={form.qrCode} alt="QR Code" class="mx-auto border-4 border-white rounded-lg" />
                        <p class="text-xs text-gray-500 mt-2">Scan with Google Authenticator or Authy</p>
                         <p class="text-xs text-gray-400 mt-1 font-mono">{form.secret}</p>
                    </div>
                    
                    <form method="POST" action="?/verifyMfa" use:enhance class="space-y-4">
                        <input type="hidden" name="secret" value={form.secret} />
                         <div>
                            <label for="token" class="block text-sm font-medium mb-2 text-gray-300">Enter Code</label>
                            <input
                                type="text"
                                id="token"
                                name="token"
                                required
                                class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-center tracking-widest font-mono text-lg"
                                placeholder="000 000"
                            />
                        </div>
                        <button
                            type="submit"
                            class="w-full py-2 px-4 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg shadow-md transition-all"
                        >
                            Verify & Enable
                        </button>
                    </form>
                 {:else}
                    <form method="POST" action="?/setupMfa" use:enhance>
                        <button
                            type="submit"
                            class="w-full py-2 px-4 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-lg shadow-md transition-all"
                        >
                            Setup MFA
                        </button>
                    </form>
                 {/if}
            {/if}
		</div>
	</div>
</div>
