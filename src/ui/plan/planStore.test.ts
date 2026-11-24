import { describe, expect, it } from 'vitest';
import { emptyConfig } from '../../core/sell/config.ts';
import { serializeRnp } from '../../core/sell/rnp.ts';
import { getPlan, needCount, openPlan, updatePlan } from './planStore.ts';

describe('the open plan', () => {
  it('opens a plan file, then edits mark it changed', async () => {
    const config = emptyConfig();
    config.groups = [
      {
        name: 'General',
        needs: [
          { kind: 'effect', effect: 7001502, copies: 2, colorScope: 'any', importance: 'high' },
        ],
      },
    ];
    await openPlan(new File([serializeRnp(config)], 'mine.rnp'));
    expect(getPlan()).toMatchObject({ file: { name: 'mine.rnp' }, dirty: false });
    expect(needCount(getPlan().config)).toBe(1);

    updatePlan((c) => ({ ...c, groups: [] }));
    expect(getPlan().dirty).toBe(true);
    expect(needCount(getPlan().config)).toBe(0);
  });

  it('reports a file that is not a plan, keeping the open one', async () => {
    const before = getPlan().config;
    // The open plan has unsaved changes: say yes to replacing it.
    globalThis.window = { confirm: () => true, addEventListener: () => {} } as unknown as Window &
      typeof globalThis;
    await openPlan(new File(['{}'], 'other.json'));
    expect(getPlan().message).toContain('Could not load other.json');
    expect(getPlan().config).toBe(before);
  });
});
