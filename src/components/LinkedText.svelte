<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { MessageKey } from '../messages';
  import { t } from '../i18n';

  let { messageKey, link }: { messageKey: MessageKey; link: Snippet } = $props();
  const parts = $derived($t(messageKey).split('{link}'));
</script>

{#each parts as part, index}
  {#if index > 0}{@render link()}{/if}{part}
{/each}
