import { useEffect, useRef, useState } from 'react';
import { parseErrorMessage, type FieldKind, type ParseResult } from '../money';

type Props = {
  id: string;
  label: string;
  value: number;
  parse: (input: string) => ParseResult;
  format: (value: number) => string;
  kind: FieldKind;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
};

/**
 * The non-dollar sibling of AmountInput: a scaled-integer field for prices,
 * withholding rates and share counts. Same contract — invalid input is shown as
 * an error and NOT committed, and the value is only reformatted on blur so the
 * cursor doesn't jump as separators appear mid-typing.
 */
export function ValueField({
  id,
  label,
  value,
  parse,
  format,
  kind,
  onChange,
  placeholder,
  className,
}: Props) {
  const [draft, setDraft] = useState(() => format(value));
  const [error, setError] = useState<string | null>(null);
  const committed = useRef(value);
  const errorId = useRef(`value-error-${Math.random().toString(36).slice(2, 9)}`);

  // Re-sync when the value changes from somewhere else (import, price refresh).
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDraft(format(value));
      setError(null);
    }
  }, [value, format]);

  const handleChange = (next: string) => {
    setDraft(next);
    const result = parse(next);
    if (result.ok) {
      setError(null);
      committed.current = result.value;
      onChange(result.value);
      return;
    }
    // Clearing the field means zero, not an error — you have to empty it to retype.
    if (result.reason === 'empty') {
      setError(null);
      committed.current = 0;
      onChange(0);
      return;
    }
    setError(parseErrorMessage(result.reason, kind));
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="numeric"
        placeholder={placeholder}
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => {
          if (!error) setDraft(format(committed.current));
        }}
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
