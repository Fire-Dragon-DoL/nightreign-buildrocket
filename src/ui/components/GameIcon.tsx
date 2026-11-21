interface Props {
  src: string | undefined;
  size?: 'sm' | 'md' | 'lg';
}

/** A game icon, or nothing when icons are not available. */
export function GameIcon({ src, size = 'sm' }: Props) {
  if (!src) return null;
  return <img className={`icon icon--${size}`} src={src} alt="" loading="lazy" decoding="async" />;
}
