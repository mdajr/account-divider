import type { Bucket } from '../types';
import type { IsoDate } from '../dates';
import { formatDollars } from '../money';
import { slotColor } from '../palette';
import type { ColorMode } from '../palette';
import { percentOf } from '../state';
import { AmountInput } from './AmountInput';
import { DateField } from './DateField';

type Props = {
  bucket: Bucket;
  index: number;
  count: number;
  balance: number;
  mode: ColorMode;
  onChange: (id: string, patch: Partial<Bucket>) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (id: string) => void;
};

export function BucketRow({ bucket, index, count, balance, mode, onChange, onMove, onRemove }: Props) {
  const color = bucket.colorOverride ?? slotColor(bucket.colorSlot, mode);
  const name = bucket.name.trim() || 'Untitled';

  return (
    <tr>
      <td className="swatch-cell">
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(bucket.id, { colorOverride: e.target.value })}
          onDoubleClick={() => onChange(bucket.id, { colorOverride: null })}
          aria-label={`Color for ${name}${bucket.colorOverride ? ' (double-click to reset)' : ''}`}
          title={bucket.colorOverride ? 'Double-click to reset to the default color' : 'Pick a color'}
        />
      </td>

      <td className="col-name">
        <label className="visually-hidden" htmlFor={`name-${bucket.id}`}>
          Bucket name
        </label>
        <input
          id={`name-${bucket.id}`}
          type="text"
          value={bucket.name}
          placeholder="Bucket name"
          onChange={(e) => onChange(bucket.id, { name: e.target.value })}
        />
      </td>

      <td className="col-amount">
        <AmountInput
          id={`amount-${bucket.id}`}
          label={`Amount for ${name}`}
          value={bucket.amount}
          onChange={(amount) => onChange(bucket.id, { amount })}
        />
      </td>

      <td className="numeric">{balance > 0 ? `${percentOf(bucket.amount, balance).toFixed(1)}%` : '—'}</td>

      <td className="col-date">
        <DateField
          id={`date-${bucket.id}`}
          label={`Spend date for ${name}`}
          value={bucket.date}
          title={
            bucket.date
              ? 'Money leaves on this day'
              : 'No date — held indefinitely. Pick a day to spend it.'
          }
          onChange={(date: IsoDate | null) => onChange(bucket.id, { date })}
        />
      </td>

      <td className="col-note">
        <label className="visually-hidden" htmlFor={`note-${bucket.id}`}>
          Note for {name}
        </label>
        <input
          id={`note-${bucket.id}`}
          type="text"
          value={bucket.note}
          placeholder="Optional note"
          onChange={(e) => onChange(bucket.id, { note: e.target.value })}
        />
      </td>

      <td>
        <div className="row-actions">
          <button
            type="button"
            className="icon"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            aria-label={`Move ${name} up`}
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            className="icon"
            onClick={() => onMove(index, 1)}
            disabled={index === count - 1}
            aria-label={`Move ${name} down`}
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            className="icon danger"
            onClick={() => onRemove(bucket.id)}
            aria-label={`Delete ${name} (${formatDollars(bucket.amount)})`}
            title="Delete bucket"
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}
