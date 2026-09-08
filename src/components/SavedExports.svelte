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

<div id="saved-area">
  <div class="saved-heading">
    <h3><Icon name="hard-drive" />Saved renders</h3>
    <span id="saved-count" hidden={!items.length}>{items.length}</span>
  </div>
  <p class="hint">Stored on this device. Download a render to save an MP4.</p>
  <p id="saved-empty" class="saved-empty" hidden={items.length > 0}>
    Your finished renders will appear here.
  </p>
  <div id="saved-exports">
    {#each items as item (item.id)}
      <div class="saved-export">
        <div class="saved-details">
          <div class="saved-name" title={item.name}>{item.name}</div>
          <div class="saved-metadata">
            {size(item.file.size)} · {new Date(item.createdAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
        <div class="saved-file-actions">
          <a href={item.url} download={item.name} aria-label={`Download ${item.name}`}
            ><Icon name="download" />Download</a
          >
          <button
            disabled={deleting.includes(item.id)}
            aria-label={`Delete saved render ${item.name}`}
            onclick={() => remove(item.id)}><Icon name="trash-2" />Delete</button
          >
        </div>
      </div>
    {/each}
  </div>
</div>
