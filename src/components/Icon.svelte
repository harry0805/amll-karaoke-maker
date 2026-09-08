<script lang="ts">
  import {
    ArrowRight,
    ArrowUpRight,
    Bookmark,
    Check,
    Download,
    FileMusic,
    Files,
    Film,
    FolderOpen,
    HardDrive,
    Library,
    Move,
    Music2,
    Palette,
    Pause,
    Pencil,
    Play,
    RotateCcw,
    RotateCw,
    Save,
    SlidersHorizontal,
    Trash2,
    Upload,
    Video,
    X,
  } from 'lucide';
  const icons = {
    'arrow-right': ArrowRight,
    'arrow-up-right': ArrowUpRight,
    bookmark: Bookmark,
    check: Check,
    download: Download,
    'file-music': FileMusic,
    files: Files,
    film: Film,
    'folder-open': FolderOpen,
    'hard-drive': HardDrive,
    library: Library,
    move: Move,
    'music-2': Music2,
    palette: Palette,
    pause: Pause,
    pencil: Pencil,
    play: Play,
    'rotate-ccw': RotateCcw,
    'rotate-cw': RotateCw,
    save: Save,
    'sliders-horizontal': SlidersHorizontal,
    'trash-2': Trash2,
    upload: Upload,
    video: Video,
    x: X,
  };
  let { name }: { name: keyof typeof icons } = $props();
</script>

<svg
  class="ui-icon size-[17px] shrink-0 align-middle"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#each icons[name] as [tag, attrs]}
    <svelte:element this={tag} {...attrs} />
  {/each}
</svg>
