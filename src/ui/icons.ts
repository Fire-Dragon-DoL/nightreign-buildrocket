/** Game icons from data/game/icons.json (see data/game/README.md). */
import icons from '../../data/game/icons.json';

interface IconsFile {
  images: string[];
  relics: Record<string, number>;
  effects: Record<string, number>;
  vessels: Record<string, number>;
}

const data = icons as IconsFile;

const lookup = (table: keyof Omit<IconsFile, 'images'>) => (id: number) => {
  const index = data[table][id];
  return index === undefined ? undefined : data.images[index];
};

export const relicIcon = lookup('relics');
export const effectIcon = lookup('effects');
export const vesselIcon = lookup('vessels');
