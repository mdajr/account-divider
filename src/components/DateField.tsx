import { isIsoDate, type IsoDate } from '../dates';

type Props = {
  id: string;
  label: string;
  value: IsoDate | null;
  onChange: (value: IsoDate | null) => void;
  showLabel?: boolean;
  className?: string;
  /** Rendered in the field when empty — browsers ignore `placeholder` here. */
  title?: string;
};

/**
 * A native date picker. Clearing it is meaningful, not an error: an empty date
 * means "held indefinitely", which is the right default for a reserve that never
 * gets spent. The value is only committed once it is a real calendar date, so a
 * half-typed year never lands in state as `0002-01-18`.
 */
export function DateField({ id, label, value, onChange, showLabel = false, className, title }: Props) {
  return (
    <div className={className}>
      <label htmlFor={id} className={showLabel ? undefined : 'visually-hidden'}>
        {label}
      </label>
      <input
        id={id}
        type="date"
        className="date-input"
        value={value ?? ''}
        title={title}
        onChange={(event) => {
          const next = event.target.value;
          onChange(isIsoDate(next) ? next : null);
        }}
      />
    </div>
  );
}
