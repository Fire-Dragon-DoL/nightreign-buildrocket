/**
 * Game icons from data/game/icons.json (local-only file, see
 * data/game/README.md). Without the file every lookup returns undefined and
 * the UI simply shows no icons.
 */
interface IconsFile {
  images: string[];
  relics: Record<string, number>;
  effects: Record<string, number>;
  vessels: Record<string, number>;
}

const found = import.meta.glob<IconsFile>('../../data/game/icons.json', {
  eager: true,
  import: 'default',
});
const icons: IconsFile | undefined = Object.values(found)[0];

const lookup = (table: keyof Omit<IconsFile, 'images'>) => (id: number) => {
  const index = icons?.[table][id];
  return index === undefined ? undefined : icons?.images[index];
};

export const hasIcons = icons !== undefined;
export const relicIcon = lookup('relics');
export const effectIcon = lookup('effects');
export const vesselIcon = lookup('vessels');
