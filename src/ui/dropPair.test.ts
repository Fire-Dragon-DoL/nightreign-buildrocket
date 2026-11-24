import { describe, expect, it } from 'vitest';
import { pairOfFiles } from './dropPair.ts';

describe('dropping a plan and a save together', () => {
  it('finds which file is which, in either order', () => {
    expect(pairOfFiles(['mine.rnp', 'NR0000.sl2'])).toEqual({ plan: 0, save: 1 });
    expect(pairOfFiles(['NR0000.CO2', 'old.rsp'])).toEqual({ plan: 1, save: 0 });
    expect(pairOfFiles(['builds.jsl2', 'mine.rnp'])).toEqual({ plan: 1, save: 0 });
  });

  it('refuses anything else', () => {
    expect(pairOfFiles(['a.rnp', 'b.rnp'])).toBeNull();
    expect(pairOfFiles(['a.sl2', 'b.jsl2'])).toBeNull();
    expect(pairOfFiles(['a.rnp', 'b.txt'])).toBeNull();
    expect(pairOfFiles(['a.rnp'])).toBeNull();
  });
});
