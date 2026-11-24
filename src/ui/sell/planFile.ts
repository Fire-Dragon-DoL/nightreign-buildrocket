/**
 * Saving and opening plan files (.rnp). With Chrome's File System Access API, "Save" writes back to
 * the file last opened or saved ("Save as…" picks a new one); without it every save is a download.
 */

import type { SellConfig } from '../../core/sell/config.ts';
import { serializeRnp } from '../../core/sell/rnp.ts';
import { ensureWritable, RNP_FILE_TYPE, saveTextFile, writeTextFile } from '../../storage/files.ts';

export interface PlanFile {
  /** File name (browsers don't tell pages the folder). */
  name: string;
  /** Where "Save" writes, when the browser gave us the file. */
  handle?: FileSystemFileHandle;
}

/** Whether "Save" can write back to a file (otherwise every save asks, like "Save as…"). */
export const canSaveInPlace = (): boolean =>
  typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

export const DEFAULT_PLAN_NAME = 'nightreign-relic-needs.rnp';

/** The name to suggest for a plan: always `.rnp` (older `.rsp` plans are saved as `.rnp`). */
export function planFileName(name: string | null | undefined): string {
  const stem = (name ?? '').replace(/\.(rnp|rsp|json)$/i, '');
  return stem ? `${stem}.rnp` : DEFAULT_PLAN_NAME;
}

/** A file "Save" may write to: one we have a handle for, already in the current format. */
export const savesInPlace = (
  file: PlanFile | null,
): file is PlanFile & { handle: FileSystemFileHandle } =>
  Boolean(file?.handle) && /\.rnp$/i.test(file?.name ?? '');

/**
 * Save `config`. "Save" writes to `file` if it can; otherwise (and for "Save as…") it asks where.
 * Returns the file saved to. Throws AbortError if the user cancels the picker.
 */
export async function savePlan(
  config: SellConfig,
  file: PlanFile | null,
  saveAs: boolean,
): Promise<PlanFile> {
  const text = serializeRnp(config);
  if (!saveAs && savesInPlace(file) && (await ensureWritable(file.handle))) {
    await writeTextFile(file.handle, text);
    return file;
  }
  const name = planFileName(file?.name);
  const handle = await saveTextFile(text, name, RNP_FILE_TYPE);
  return handle ? { name: handle.name, handle } : { name };
}

/** What the plan's file line says: where "Save" goes, or that it will ask. */
export function saveTargetText(file: PlanFile | null): string {
  if (!canSaveInPlace()) return file ? `Opened from ${file.name}` : 'Not saved yet';
  if (savesInPlace(file)) return `Save writes to ${file.name}`;
  if (file?.handle) return `Opened from ${file.name}: Save asks for a new .rnp file`;
  if (file) return `Opened from ${file.name}: Save asks where to save`;
  return 'Not saved yet: Save asks where to save';
}
