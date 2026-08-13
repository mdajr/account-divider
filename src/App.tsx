import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppState, Bucket } from './types';
import { load, save } from './storage';
import { createBucket, derive, moveBucket } from './state';
import { AllocationBar } from './components/AllocationBar';
import { AmountInput } from './components/AmountInput';
import { BucketTable } from './components/BucketTable';
import { DataTransfer } from './components/DataTransfer';
import { Summary } from './components/Summary';

export function App() {
  const [state, setState] = useState<AppState>(load);

  useEffect(() => {
    save(state);
  }, [state]);

  const derived = useMemo(() => derive(state), [state]);

  const setBalance = useCallback((balance: number) => {
    setState((current) => ({ ...current, balance }));
  }, []);

  const updateBucket = useCallback((id: string, patch: Partial<Bucket>) => {
    setState((current) => ({
      ...current,
      buckets: current.buckets.map((bucket) => (bucket.id === id ? { ...bucket, ...patch } : bucket)),
    }));
  }, []);

  const addBucket = useCallback((name: string, amount: number) => {
    setState((current) => ({
      ...current,
      buckets: [...current.buckets, createBucket(current.buckets, name, amount)],
    }));
  }, []);

  const removeBucket = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      buckets: current.buckets.filter((bucket) => bucket.id !== id),
    }));
  }, []);

  const reorderBucket = useCallback((index: number, delta: number) => {
    setState((current) => ({ ...current, buckets: moveBucket(current.buckets, index, delta) }));
  }, []);

  return (
    <main className="page">
      <header>
        <h1 className="page-title">Account Divider</h1>
        <p className="page-subtitle">Split a savings balance into named buckets and see what's left.</p>
      </header>

      <section className="card">
        <AmountInput
          id="account-balance"
          className="balance-field"
          label="Account balance"
          showLabel
          value={state.balance}
          onChange={setBalance}
        />
      </section>

      <section className="card">
        <Summary balance={state.balance} derived={derived} />
      </section>

      <section className="card">
        <div className="section-head">
          <h2 className="section-title">Allocation</h2>
        </div>
        <AllocationBar state={state} derived={derived} />
      </section>

      <section className="card">
        <div className="section-head">
          <h2 className="section-title">Buckets</h2>
        </div>
        <BucketTable
          buckets={state.buckets}
          balance={state.balance}
          onChange={updateBucket}
          onMove={reorderBucket}
          onRemove={removeBucket}
          onAdd={addBucket}
        />
      </section>

      <section className="card">
        <div className="section-head">
          <h2 className="section-title">Backup</h2>
        </div>
        <DataTransfer state={state} onImport={setState} />
      </section>
    </main>
  );
}
