/** Turn free text (character names) into something safe in a file name. */
export const fileSafe = (text: string) =>
  text.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '');
