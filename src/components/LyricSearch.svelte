<script lang="ts">
  import { onDestroy } from 'svelte';
  import { t, translateMessage } from '../i18n';
  import { errorMessage, message, type DisplayMessage } from '../messages';
  import { LrcRedClient, lyricPageURL, type LyricSearchHit } from '../lrc-red';
  import { parseLyrics } from '../lyrics';
  import type { StudioState } from '../studio.svelte';
  import Icon from './Icon.svelte';
  import LinkedText from './LinkedText.svelte';

  let { studio }: { studio: StudioState } = $props();
  const client = new LrcRedClient();
  let dialog: HTMLDialogElement;
  let query = $state('');
  let searchedQuery = $state('');
  let hits = $state<LyricSearchHit[]>([]);
  let next = $state<string | null>(null);
  let searched = $state(false);
  let searching = $state(false);
  let importing = $state('');
  let error = $state<DisplayMessage>('');
  let invalid = $state<Record<string, boolean>>({});
  let controller: AbortController | undefined;

  function cancel() {
    controller?.abort();
    controller = undefined;
    searching = false;
    importing = '';
  }
  onDestroy(cancel);

  async function search(more = false) {
    if (searching || importing || studio.session.exporting || (!more && !query.trim())) return;
    cancel();
    const request = (controller = new AbortController());
    searching = true;
    error = '';
    if (!more) {
      hits = [];
      next = null;
      searched = false;
      searchedQuery = query.trim();
      invalid = {};
    }
    try {
      const page = await client.search(
        searchedQuery,
        request.signal,
        more ? next || undefined : undefined,
      );
      if (request.signal.aborted) return;
      const existing = new Set(hits.map((hit) => hit.isrc));
      hits = [...hits, ...page.hits.filter((hit) => !existing.has(hit.isrc))];
      next = page.next;
      searched = true;
    } catch (cause) {
      if (!request.signal.aborted) error = errorMessage(cause);
    } finally {
      if (controller === request) searching = false;
    }
  }

  async function useLyrics(hit: LyricSearchHit) {
    if (searching || importing || studio.session.exporting) return;
    cancel();
    const request = (controller = new AbortController());
    importing = hit.isrc;
    error = '';
    try {
      const file = await client.download(hit, request.signal);
      const text = await file.text();
      if (request.signal.aborted) return;
      try {
        parseLyrics(text);
      } catch {
        invalid = { ...invalid, [hit.isrc]: true };
        error = message('lyricSearch.invalidTTML');
        return;
      }
      if (
        await studio.loadTTML(file, {
          title: `${hit.artist} — ${hit.title}`,
          url: lyricPageURL(hit.isrc),
        })
      )
        dialog.close();
      else error = studio.session.errors.source;
    } catch (cause) {
      if (!request.signal.aborted) error = errorMessage(cause);
    } finally {
      if (controller === request) importing = '';
    }
  }
</script>

<button
  id="search-lyrics"
  type="button"
  class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-solid border-accent bg-accent px-3.5 py-3 text-[14px] font-semibold text-accent-ink outline-offset-[5px] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-35"
  disabled={studio.session.exporting}
  onclick={() => dialog.showModal()}><Icon name="search" />{$t('lyricSearch.searchLyrics')}</button
>

<dialog
  id="lyric-search"
  class="m-auto max-h-[calc(100dvh-32px)] w-[min(640px,calc(100vw-28px))] overflow-y-auto rounded-[14px] border border-solid border-[#3b3b43] bg-panel p-6 text-foreground shadow-[0_24px_80px_#0008] backdrop:bg-black/60 backdrop:backdrop-blur-[4px] max-phone:p-4"
  aria-labelledby="lyric-search-title"
  aria-describedby="lyric-search-description"
  bind:this={dialog}
  onclose={cancel}
>
  <div class="mb-2 flex items-center justify-between gap-3">
    <h2 id="lyric-search-title" class="m-0 text-[20px] font-semibold">
      {$t('lyricSearch.searchLyrics')}
    </h2>
    <button
      type="button"
      class="flex cursor-pointer rounded-md border-0 bg-transparent p-2 text-muted outline-offset-2 hover:bg-control hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
      aria-label={$t('lyricSearch.close')}
      onclick={() => dialog.close()}><Icon name="x" /></button
    >
  </div>
  <p id="lyric-search-description" class="mt-0 mb-5 text-[13px] leading-relaxed text-muted">
    <LinkedText messageKey="lyricSearch.poweredBy">
      {#snippet link()}<a
          class="text-accent-text underline underline-offset-2"
          href="https://lrc.red"
          target="_blank"
          rel="noopener noreferrer">lrc.red</a
        >{/snippet}
    </LinkedText>
  </p>
  <form
    class="flex gap-2"
    role="search"
    onsubmit={(event) => {
      event.preventDefault();
      void search();
    }}
  >
    <div class="min-w-0 flex-1">
      <label for="lyric-search-query" class="mb-2 block text-[13px]"
        >{$t('lyricSearch.titleOrArtist')}</label
      >
      <input
        id="lyric-search-query"
        type="search"
        class="box-border w-full rounded-lg border border-solid border-control-border bg-field px-3 py-2.5 text-[16px] text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
        bind:value={query}
        placeholder={$t('lyricSearch.placeholder')}
        maxlength="200"
        disabled={searching || !!importing || studio.session.exporting}
      />
    </div>
    <button
      type="submit"
      class="mt-auto cursor-pointer rounded-lg border-0 bg-accent px-4 py-3 text-[13px] font-semibold text-accent-ink outline-offset-2 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-35"
      disabled={!query.trim() || searching || !!importing || studio.session.exporting}
    >
      {$t(searching ? 'lyricSearch.searching' : 'lyricSearch.search')}
    </button>
  </form>
  <p class="my-4 text-[13px] leading-relaxed text-error" role="alert" hidden={!error}>
    {$translateMessage(error)}
  </p>
  <div role="status" aria-live="polite" class="my-4 text-[13px] text-muted">
    {#if importing}{$t('lyricSearch.validating')}
    {:else if searching}{$t('lyricSearch.searching')}
    {:else if searched && !hits.length}{$t('lyricSearch.noResults')}
    {:else if searched}{$t('lyricSearch.results', { count: hits.length })}
    {:else}{$t('lyricSearch.searchHint')}{/if}
  </div>
  <ul class="m-0 list-none space-y-3 p-0" aria-busy={searching}>
    {#each hits as hit (hit.isrc)}
      <li class="rounded-lg border border-solid border-divider bg-field p-4">
        <h3 class="m-0 text-[15px] font-semibold [overflow-wrap:anywhere]">{hit.title}</h3>
        <p class="mt-1 mb-0 text-[13px] [overflow-wrap:anywhere] text-muted">{hit.artist}</p>
        {#if hit.album || hit.year}<p
            class="mt-1 mb-0 text-[12px] [overflow-wrap:anywhere] text-muted"
          >
            {[hit.album, hit.year].filter(Boolean).join(' · ')}
          </p>{/if}
        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          <button
            type="button"
            class="inline-flex cursor-pointer items-center gap-2 rounded-md border-0 bg-accent px-3 py-2 text-[13px] font-semibold text-accent-ink outline-offset-2 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-35"
            disabled={searching || !!importing || !!invalid[hit.isrc] || studio.session.exporting}
            onclick={() => useLyrics(hit)}
            ><Icon name="download" />{$t(
              invalid[hit.isrc]
                ? 'lyricSearch.noValidTTML'
                : importing === hit.isrc
                  ? 'lyricSearch.validating'
                  : 'lyricSearch.useTTML',
            )}</button
          >
          <a
            class="inline-flex items-center gap-1 text-[13px] text-accent-text underline underline-offset-2"
            href={lyricPageURL(hit.isrc)}
            target="_blank"
            rel="noopener noreferrer"
            >{$t('lyricSearch.openSource')}<Icon name="arrow-up-right" /></a
          >
        </div>
      </li>
    {/each}
  </ul>
  {#if next}
    <button
      type="button"
      class="mt-4 w-full cursor-pointer rounded-lg border border-solid border-control-border bg-control px-4 py-2.5 text-[13px] text-foreground outline-offset-2 hover:border-accent-border focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-35"
      disabled={searching || !!importing || studio.session.exporting}
      onclick={() => search(true)}>{$t('lyricSearch.more')}</button
    >
  {/if}
  <p class="mt-5 mb-0 text-[12px] leading-relaxed text-muted">{$t('lyricSearch.timingHelp')}</p>
</dialog>
