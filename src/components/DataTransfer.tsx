import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { AppState } from '../types';
import { parseState } from '../storage';

type Props = {
  state: AppState;
  onImport: (state: AppState) => void;
};

type Status = { kind: 'ok' | 'error'; message: string } | null;

export function DataTransfer({ state, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `account-divider-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus({ kind: 'ok', message: 'Exported.' });
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately so re-picking the same file fires change again.
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      // Same validator the app uses on load — an import is never trusted.
      const parsed = parseState(JSON.parse(text));
      if (!parsed) {
        setStatus({
          kind: 'error',
          message: "That file isn't valid Account Divider data. Nothing was changed.",
        });
        return;
      }
      const hasData = state.buckets.length > 0 || state.inflows.length > 0 || state.balance > 0;
      if (hasData && !window.confirm('Replace your current balance, buckets and expected deposits with this file?')) {
        setStatus({ kind: 'ok', message: 'Import cancelled.' });
        return;
      }
      onImport(parsed);
      const buckets = `${parsed.buckets.length} ${parsed.buckets.length === 1 ? 'bucket' : 'buckets'}`;
      const inflows = `${parsed.inflows.length} ${parsed.inflows.length === 1 ? 'deposit' : 'deposits'}`;
      setStatus({ kind: 'ok', message: `Imported ${buckets} and ${inflows}.` });
    } catch {
      setStatus({ kind: 'error', message: "Couldn't read that file. Nothing was changed." });
    }
  };

  return (
    <div>
      <div className="transfer">
        <button type="button" onClick={exportJson}>
          Export JSON
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={importJson}
        />
        <p className="transfer-note">
          Your data lives in this browser only. Export a copy to keep a backup or move it to another
          device.
        </p>
      </div>
      {status && (
        <p className={status.kind === 'error' ? 'transfer-status error' : 'transfer-status'} role="status">
          {status.message}
        </p>
      )}
    </div>
  );
}
