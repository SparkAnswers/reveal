import { useSyncExternalStore } from 'react';
import { locationService } from '@grafana/runtime';

/**
 * Preview scrubber state. It lives in memory only, never in the panel options, so it cannot be
 * saved with the dashboard and never reaches viewers. The value is tied to the panel that was open
 * in the panel editor when it was set and only applies while that same panel is being edited.
 */
let current: { panel: string; value: number } | null = null;
const listeners = new Set<() => void>();

/** Id of the panel open in the panel editor (Grafana adds ?editPanel=<id> to the URL), if any. */
export function editingPanelKey(): string | undefined {
  try {
    const v = locationService.getSearchObject().editPanel;
    return v === undefined || v === null || v === '' ? undefined : String(v);
  } catch {
    return undefined;
  }
}

/** Preview percent (0..100) for the panel being edited, or null to follow the schedule. */
export function getPreview(): number | null {
  const panel = editingPanelKey();
  return panel !== undefined && current?.panel === panel ? current.value : null;
}

/** Set the preview for the panel being edited; null returns to live. A no-op outside the editor. */
export function setPreview(value: number | null): void {
  const panel = editingPanelKey();
  current = value === null || panel === undefined ? null : { panel, value };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Leaving the panel editor only changes the URL, so re-evaluate on navigation too.
  let unlisten: (() => void) | undefined;
  try {
    unlisten = locationService.getHistory?.().listen(listener);
  } catch {
    unlisten = undefined;
  }
  return () => {
    listeners.delete(listener);
    unlisten?.();
  };
}

export function usePreview(): number | null {
  return useSyncExternalStore(subscribe, getPreview);
}
