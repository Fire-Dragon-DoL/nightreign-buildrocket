import { describe, expect, it } from 'vitest';
import { emptyConfig } from '../../core/sell/config.ts';
import { planFileName, savePlan, savesInPlace } from './planFile.ts';

/** A file handle that records what's written to it. */
function fakeHandle(name: string) {
  const written: string[] = [];
  const handle = {
    kind: 'file',
    name,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    createWritable: async () => ({
      write: async (data: string) => void written.push(data),
      close: async () => {},
    }),
  } as unknown as FileSystemFileHandle;
  return { handle, written };
}

describe('plan files', () => {
  it('suggests .rnp names, also for plans opened from .rsp files', () => {
    expect(planFileName(null)).toBe('nightreign-relic-needs.rnp');
    expect(planFileName('mine.rsp')).toBe('mine.rnp');
    expect(planFileName('mine.rnp')).toBe('mine.rnp');
    expect(planFileName('mine')).toBe('mine.rnp');
  });

  it('Save writes back only to an .rnp file it has a handle for', () => {
    expect(savesInPlace(null)).toBe(false);
    expect(savesInPlace({ name: 'a.rnp' })).toBe(false);
    expect(savesInPlace({ name: 'a.rsp', handle: fakeHandle('a.rsp').handle })).toBe(false);
    expect(savesInPlace({ name: 'a.rnp', handle: fakeHandle('a.rnp').handle })).toBe(true);
  });

  it('Save writes to the same file without asking', async () => {
    const { handle, written } = fakeHandle('a.rnp');
    const file = { name: 'a.rnp', handle };
    expect(await savePlan(emptyConfig(), file, false)).toBe(file);
    expect(JSON.parse(written[0] ?? '').format).toBe('buildrocket-rnp');
  });
});
