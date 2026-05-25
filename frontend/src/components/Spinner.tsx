interface SpinnerProps {
  /** true = fills the full viewport height */
  fullPage?: boolean;
  /** CSS padding around the spinner (default 48px) */
  padding?: number;
}

export default function Spinner({ fullPage = false, padding = 48 }: SpinnerProps) {
  if (fullPage) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)]">
        <span className="spinner spinner-dark" />
      </div>
    );
  }
  return (
    <div className="flex justify-center" style={{ padding }}>
      <span className="spinner spinner-dark" />
    </div>
  );
}
