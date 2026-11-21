import { u64, viewOf } from '../binary/bytes.ts';
import { PROFILE_STEAM_ID_OFFSET } from './format.ts';

export interface Profile {
  /** Decimal string; "0" on platforms without Steam. */
  steamId: string;
}

/** Parse the global profile entry (entry 10). Only what we need so far. */
export function parseProfile(data: Uint8Array): Profile {
  return { steamId: u64(viewOf(data), PROFILE_STEAM_ID_OFFSET).toString() };
}
