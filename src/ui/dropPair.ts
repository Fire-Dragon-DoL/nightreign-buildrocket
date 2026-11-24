/** Telling apart the two files dropped together on the window: a plan and a save (or builds). */

const PLAN = /\.(rnp|rsp)$/i;
const SAVE = /\.(sl2|co2|jsl2|json)$/i;

/** Indexes of the plan and the save among two dropped file names, or null if they aren't that pair. */
export function pairOfFiles(names: string[]): { plan: number; save: number } | null {
  if (names.length !== 2) return null;
  const [a = '', b = ''] = names;
  if (PLAN.test(a) && SAVE.test(b)) return { plan: 0, save: 1 };
  if (PLAN.test(b) && SAVE.test(a)) return { plan: 1, save: 0 };
  return null;
}

/** Whether a drag carries exactly two files (their names are hidden until the drop). */
export const draggingTwoFiles = (data: DataTransfer | null): boolean =>
  !!data &&
  data.types.includes('Files') &&
  data.items.length === 2 &&
  Array.from(data.items).every((i) => i.kind === 'file');
