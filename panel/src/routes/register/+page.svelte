<script lang="ts">
	import { enhance } from '$app/forms';
	export let form;
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-900 text-white">
	<div class="w-full max-w-md p-8 bg-gray-800 rounded-lg shadow-xl">
		<h1 class="text-3xl font-bold mb-6 text-center text-primary-400">PetalPort Registration</h1>

		{#if form?.error}
			<div class="p-4 mb-4 text-sm text-red-500 bg-red-900/20 border border-red-500/50 rounded-lg">
				{form.error}
			</div>
		{/if}

		<form method="POST" use:enhance class="space-y-6">
			<div>
				<label for="username" class="block text-sm font-medium mb-2 text-gray-300">Username</label>
				<input
					type="text"
					id="username"
					name="username"
					required
					autocapitalize="none"
					class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
					placeholder="Choose a username"
				/>
			</div>

			<div>
				<label for="password" class="block text-sm font-medium mb-2 text-gray-300">Password</label>
				<input
					type="password"
					id="password"
					name="password"
					required
					class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
					placeholder="Choose a strong password"
				/>
			</div>

            <div>
				<label for="confirmPassword" class="block text-sm font-medium mb-2 text-gray-300">Confirm Password</label>
				<input
					type="password"
					id="confirmPassword"
					name="confirmPassword"
					required
					class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
					placeholder="Confirm your password"
				/>
			</div>

			<button
				type="submit"
				class="w-full py-3 px-4 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0"
			>
				Create Account
			</button>
            <div class="text-center mt-4">
                <a href="/login" class="text-sm text-primary-400 hover:text-primary-300">Already have an account? Login</a>
            </div>
		</form>
	</div>
</div>
