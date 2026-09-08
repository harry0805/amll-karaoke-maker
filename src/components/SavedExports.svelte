<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { listStoredExports, deleteStoredExport, type StoredExport } from '../export-storage';
  import Icon from './Icon.svelte';
  let { revision, onerror }: { revision: number; onerror: (message: string) => void } = $props();
  let items = $state<(StoredExport & { url: string })[]>([]);
  let deleting = $state<string[]>([]);
  let refresh = $state(0);
  let urls: string[] = [];
  onDestroy(() => urls.forEach((url) => URL.revokeObjectURL(url)));
  $effect(() => {
    revision;
    refresh;
    let cancelled = false;
    untrack(() => {
      void listStoredExports()
        .then((exports) => {
          if (cancelled) return;
          const nextURLs: string[] = [];
          const next = exports.map((item) => {
            const url = URL.createObjectURL(item.file);
            nextURLs.push(url);
            return { ...item, url };
          });
          // Keep existing downloads usable if refreshing the storage list fails.
          urls.forEach((url) => URL.revokeObjectURL(url));
          urls = nextURLs;
          items = next;
        })
        .catch((error) => {
          if (!cancelled) onerror(String(error));
        });
    });
    return () => {
      cancelled = true;
    };
  });
  async function remove(id: string) {
    deleting = [...deleting, id];
    try {
      await deleteStoredExport(id);
      refresh++;
    } catch (error) {
      onerror(String(error));
    } finally {
      deleting = deleting.filter((item) => item !== id);
    }
  }
  const size = (bytes: number) =>
    bytes < 1024 ** 2
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
</script>

<div class="mt-[30px] border-0 border-t border-solid border-divider pt-6" id="saved-area">
  <div class="flex items-center gap-2">
    <h3 class="m-0 flex items-center gap-[9px] text-[15px] font-semibold [&>svg]:text-accent-text">
      <Icon name="hard-drive" />Saved renders
    </h3>
    <span
      class="rounded-[5px] bg-control px-1.5 py-0.5 text-[11px] text-[#b6b6bf]"
      id="saved-count"
      hidden={!items.length}>{items.length}</span
    >
  </div>
  <p
    class="mt-1.5 mb-0 text-[12px] leading-[1.5] text-muted [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
  >
    Stored on this device. Download a render to save an MP4.
  </p>
  <p
    id="saved-empty"
    class="py-5 text-[13px] leading-[1.6] text-[#94949f]"
    hidden={items.length > 0}
  >
    Your finished renders will appear here.
  </p>
  <div id="saved-exports">
    {#each items as item (item.id)}
      <div
        class="saved-export mt-3 rounded-lg border border-solid border-[#303037] bg-[#19191e] p-3.5"
      >
        <div>
          <div class="text-[14px] leading-[1.5] [overflow-wrap:anywhere]" title={item.name}>
            {item.name}
          </div>
          <div class="mt-[5px] text-[12px] text-muted">
            {size(item.file.size)} · {new Date(item.createdAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
        <div class="mt-3 flex items-center gap-3">
          <a
            class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[5px] border border-solid border-accent-border px-2.5 py-1.5 text-[12px] font-semibold text-accent-text no-underline outline-offset-[5px] hover:bg-accent-muted-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
            href={item.url}
            download={item.name}
            aria-label={`Download ${item.name}`}><Icon name="download" />Download</a
          >
          <button
            class="ml-auto inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-transparent bg-transparent px-2 py-1.5 text-[12px] text-[#a5a5b0] outline-offset-[5px] hover:bg-[#302020] hover:text-error focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
            disabled={deleting.includes(item.id)}
            aria-label={`Delete saved render ${item.name}`}
            onclick={() => remove(item.id)}><Icon name="trash-2" />Delete</button
          >
        </div>
      </div>
    {/each}
  </div>
</div>
