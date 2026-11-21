interface Props {
  label: string;
  /** 0..1, or undefined while the amount of work is unknown. */
  value?: number | undefined;
  testId?: string;
}

/** A labelled progress bar; indeterminate (animated) when `value` is undefined. */
export function ProgressBar({ label, value, testId }: Props) {
  return (
    <div className="progress" data-testid={testId}>
      <span className="muted">{label}</span>
      {value === undefined ? (
        <progress aria-label={label} />
      ) : (
        <progress aria-label={label} max={1} value={value} />
      )}
    </div>
  );
}
