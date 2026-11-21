/**
 * Reading and writing user data as real files on disk (never localStorage).
 *
 * Uses Chrome's File System Access API, which works on file://. Falls back to
 * a classic download when it is unavailable.
 */

export const JSON_FILE_TYPE: FilePickerAcceptType = {
  description: 'JSON',
  accept: { 'application/json': ['.json'] },
};

export const CSV_FILE_TYPE: FilePickerAcceptType = {
  description: 'CSV (spreadsheet)',
  accept: { 'text/csv': ['.csv'] },
};

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Ask the user where to save `contents`, then write it. Returns the handle so
 * later saves can go to the same file without asking again, or undefined if
 * the fallback download was used. Throws AbortError if the user cancels.
 */
export async function saveTextFile(
  contents: string,
  suggestedName: string,
  type: FilePickerAcceptType = JSON_FILE_TYPE,
): Promise<FileSystemFileHandle | undefined> {
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({ suggestedName, types: [type] });
    await writeTextFile(handle, contents);
    return handle;
  }
  downloadText(contents, suggestedName, Object.keys(type.accept)[0] ?? 'text/plain');
  return undefined;
}

/** Overwrite a file the user already picked. */
export async function writeTextFile(handle: FileSystemFileHandle, contents: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(contents);
  } finally {
    await writable.close();
  }
}

/** Make sure we may still write to a remembered handle (asks the user if needed). */
export async function ensureWritable(handle: FileSystemFileHandle): Promise<boolean> {
  const mode = { mode: 'readwrite' } as const;
  if ((await handle.queryPermission(mode)) === 'granted') return true;
  return (await handle.requestPermission(mode)) === 'granted';
}

function downloadText(contents: string, name: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
