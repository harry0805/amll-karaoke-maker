import {
  createElement, createIcons, ArrowRight, ArrowUpRight, Bookmark, Check,
  Download, FileMusic, Files, Film, FolderOpen, HardDrive, Library, Move,
  Music2, Palette, Pause, Pencil, Play, RotateCcw, RotateCw,
  Save, SlidersHorizontal, Trash2, Upload, Video, X,
} from 'lucide';

// Explicit imports keep the rest of the icon library out of the browser bundle.
const icons = {
  ArrowRight, ArrowUpRight, Bookmark, Check, Download, FileMusic, Files,
  Film, FolderOpen, HardDrive, Library, Move, Music2, Palette, Pause, Pencil,
  Play, RotateCcw, RotateCw, Save, SlidersHorizontal, Trash2,
  Upload, Video, X,
};
const actionIcons = { download: Download, 'trash-2': Trash2, pencil: Pencil, save: Save, check: Check, x: X, 'rotate-ccw': RotateCcw };
export type IconName = keyof typeof actionIcons;
const attrs = { 'aria-hidden': 'true', focusable: 'false', class: 'ui-icon', 'stroke-width': 1.8 };

export function initializeIcons() {
  createIcons({ icons, attrs });
}

export function createIcon(name: IconName) {
  return createElement(actionIcons[name], attrs);
}
