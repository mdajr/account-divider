import { useEffect, useRef, useState } from 'react';
import { formatDollars, parseDollars, parseErrorMessage } from '../money';

type Props = {
  value: number;
  onChange: (value: number) => void;
  label: string;
  /** Visible label above the field; otherwise the label is screen-reader only. */
  showLabel?: boolean;
  className?: string;
  id?: string;
};

/**
 * Whole-dollar field. Invalid input (notably anything with cents) is surfaced as
 * an error and NOT committed — truncating it silently would quietly change the
 * number the user typed.
 */
/** Resting display: formatted currency. Blank at zero so the placeholder shows. */
const display = (value: number) => (value === 0 ? '' : formatDollars(value));

export function AmountInput({ value, onChange, label, showLabel = false, className, id }: Props) {
  const [draft, setDraft] = useState(() => display(value));
  const [error, setError] = useState<string | null>(null);
  const committed = useRef(value);
  const errorId = useRef(`amount-error-${Math.random().toString(36).slice(2, 9)}`);

  // Re-sync when the value changes from somewhere else (import, reset).
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDraft(display(value));
      setError(null);
    }
  }, [value]);

  const handleChange = (next: string) => {
    setDraft(next);
    const result = parseDollars(next);
    if (result.ok) {
      setError(null);
      committed.current = result.value;
      onChange(result.value);
      return;
    }
    // A cleared field means zero, not an error — you have to empty it to retype.
    if (result.reason === 'empty') {
      setError(null);
      committed.current = 0;
      onChange(0);
      return;
    }
    setError(parseErrorMessage(result.reason));
  };

  // Reformat only once editing stops — reformatting mid-keystroke would fight
  // the cursor as separators appear and shift the text under it.
  const handleBlur = () => {
    if (error) return;
    setDraft(display(committed.current));
  };

  return (
    <div className={className}>
      <label htmlFor={id} className={showLabel ? undefined : 'visually-hidden'}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="numeric"
        placeholder={formatDollars(0)}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId.current : undefined}
      />
      {error && (
        <p className="field-error" id={errorId.current}>
          {error}
        </p>
      )}
    </div>
  );
}
