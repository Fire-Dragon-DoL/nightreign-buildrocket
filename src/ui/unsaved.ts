/**
 * Unsaved changes: pages report theirs, and closing or reloading the tab asks for confirmation
 * while any is unsaved (the browser shows its own "Leave site?" dialog).
 */
import { useEffect } from 'react';

const unsaved = new Set<string>();
let installed = false;

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (unsaved.size === 0) return;
  event.preventDefault();
  // Older Chrome versions need returnValue set to show the dialog.
  event.returnValue = '';
}

export function setUnsaved(key: string, value: boolean): void {
  if (value) unsaved.add(key);
  else unsaved.delete(key);
  if (!installed && typeof window !== 'undefined') {
    window.addEventListener('beforeunload', onBeforeUnload);
    installed = true;
  }
}

export const hasUnsaved = (): boolean => unsaved.size > 0;

/** While `dirty`, closing the tab asks first. */
export function useUnsavedGuard(key: string, dirty: boolean): void {
  useEffect(() => {
    setUnsaved(key, dirty);
    return () => setUnsaved(key, false);
  }, [key, dirty]);
}
