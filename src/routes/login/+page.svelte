<script lang="ts">
	let { data, form } = $props();
</script>

<div class="wrap">
	<div class="panel card">
		<svg viewBox="0 0 32 32" width="48" height="48" aria-hidden="true"><rect x="3" y="12" width="26" height="9" rx="3" transform="rotate(-28 16 16)" fill="#3a4148" /><path d="M8 24 L24 9 L25.5 10.5 L9.5 25.5 Z" fill="var(--accent)" /><path d="M24 9 L27 7.5 L25.5 10.5 Z" fill="#eceeef" /></svg>
		<h1>Whetstone</h1>
		<p class="muted">Communication is the skill of the century. Hone it like your sword.</p>
		{#if !data.configured}<p class="flash warn">No passphrase is configured. Set WS_PASSPHRASE_HASH (see the README).</p>{/if}
		<form method="POST">
			<label for="p">Passphrase</label>
			<input id="p" name="passphrase" type="password" autocomplete="current-password" required />
			{#if form?.error}<p class="flash bad">{form.error}</p>{/if}
			<button class="primary lg block" type="submit" style="margin-top:14px">Enter</button>
		</form>
	</div>
</div>

<style>
	.wrap { min-height: 80vh; display: grid; place-items: center; }
	.card { width: min(380px, 100%); padding: 28px 24px; text-align: left; }
	.card h1 { margin-top: 12px; }
</style>
