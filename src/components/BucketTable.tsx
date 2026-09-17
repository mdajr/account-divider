import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Bucket } from '../types';
import type { IsoDate } from '../dates';
import { parseDollars, parseErrorMessage } from '../money';
import { useColorMode } from '../hooks';
import { BucketRow } from './BucketRow';
import { DateField } from './DateField';

type Props = {
  buckets: Bucket[];
  balance: number;
  onChange: (id: string, patch: Partial<Bucket>) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (id: string) => void;
  onAdd: (name: string, amount: number, date: IsoDate | null) => void;
};

export function BucketTable({ buckets, balance, onChange, onMove, onRemove, onAdd }: Props) {
  const mode = useColorMode();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<IsoDate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the bucket a name');
      return;
    }
    // An empty amount is a legitimate placeholder bucket: name it now, fund it later.
    const parsed = amount.trim() === '' ? ({ ok: true, value: 0 } as const) : parseDollars(amount);
    if (!parsed.ok) {
      setError(parseErrorMessage(parsed.reason));
      return;
    }
    onAdd(trimmed, parsed.value, date);
    setName('');
    setAmount('');
    setDate(null);
    setError(null);
  };

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>
              <span className="visually-hidden">Color</span>
            </th>
            <th>Bucket</th>
            <th className="right">Amount</th>
            <th className="right">Share</th>
            <th>Spend on</th>
            <th>Note</th>
            <th>
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {buckets.length === 0 && (
            <tr>
              <td className="empty-row" colSpan={7}>
                No buckets yet — add one below to start dividing the balance.
              </td>
            </tr>
          )}

          {buckets.map((bucket, index) => (
            <BucketRow
              key={bucket.id}
              bucket={bucket}
              index={index}
              count={buckets.length}
              balance={balance}
              mode={mode}
              onChange={onChange}
              onMove={onMove}
              onRemove={onRemove}
            />
          ))}

          <tr className="add-row">
            <td />
            <td className="col-name">
              <label className="visually-hidden" htmlFor="new-bucket-name">
                New bucket name
              </label>
              <input
                id="new-bucket-name"
                type="text"
                value={name}
                placeholder="New bucket"
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyDown={onEnter}
              />
            </td>
            <td className="col-amount">
              <label className="visually-hidden" htmlFor="new-bucket-amount">
                New bucket amount
              </label>
              <input
                id="new-bucket-amount"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className="numeric"
                value={amount}
                placeholder="$0"
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                onKeyDown={onEnter}
              />
            </td>
            <td />
            <td className="col-date">
              <DateField
                id="new-bucket-date"
                label="New bucket spend date"
                value={date}
                title="Optional — leave empty to hold this money indefinitely"
                onChange={setDate}
              />
            </td>
            <td />
            <td>
              <div className="row-actions">
                <button type="button" className="primary" onClick={submit}>
                  Add
                </button>
              </div>
            </td>
          </tr>

          {error && (
            <tr>
              <td colSpan={7}>
                <p className="field-error" role="alert">
                  {error}
                </p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
