import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Bucket, CashInflow, RsuInflow } from './types';
import type { IsoDate } from './dates';
import { todayIso } from './dates';
import { load, save } from './storage';
import { createBucket, createCashInflow, createRsuInflow, moveBucket, tickersIn } from './state';
import { projectTimeline } from './timeline';
import { probe, refreshQuotes } from './quotes';
import { AmountInput } from './components/AmountInput';
import { BucketTable } from './components/BucketTable';
import { DataTransfer } from './components/DataTransfer';
import { InflowTable, type PriceStatus, type ProbeResults } from './components/InflowTable';
import { Summary } from './components/Summary';
import { Timeline } from './components/Timeline';

export function App() {
  const [state, setState] = useState<AppState>(load);
  const [refreshing, setRefreshing] = useState(false);
  const [priceStatus, setPriceStatus] = useState<PriceStatus>(null);
  const [probing, setProbing] = useState(false);
  const [probeResults, setProbeResults] = useState<ProbeResults>(null);

  // Read once per mount. A session left open across midnight keeps yesterday's
  // baseline until reload, which is harmless — every figure is a projection.
  const today = useMemo<IsoDate>(() => todayIso(), []);

  useEffect(() => {
    save(state);
  }, [state]);

  const projection = useMemo(() => projectTimeline(state, today), [state, today]);
  const todayMilestone = projection.milestones[0]!;
  const tickers = useMemo(() => tickersIn(state.inflows), [state.inflows]);

  /* ---------- balance & buckets ---------- */

  const setBalance = useCallback((balance: number) => {
    setState((current) => ({ ...current, balance }));
  }, []);

  const updateBucket = useCallback((id: string, patch: Partial<Bucket>) => {
    setState((current) => ({
      ...current,
      buckets: current.buckets.map((bucket) => (bucket.id === id ? { ...bucket, ...patch } : bucket)),
    }));
  }, []);

  const addBucket = useCallback((name: string, amount: number, date: IsoDate | null) => {
    setState((current) => ({
      ...current,
      buckets: [...current.buckets, createBucket(current.buckets, name, amount, date)],
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

  /* ---------- prices ---------- */

  // The fetch is async, so it needs the quotes as of when it *finishes*, not the
  // ones captured in the closure when the button was clicked.
  const quotesRef = useRef(state.quotes);
  useEffect(() => {
    quotesRef.current = state.quotes;
  }, [state.quotes]);

  const runRefresh = useCallback(
    async (wanted: readonly string[], force: boolean) => {
      if (wanted.length === 0) return;
      setRefreshing(true);
      try {
        const outcome = await refreshQuotes(wanted, quotesRef.current, today, { force });
        if (outcome.updated.length > 0) {
          setState((current) => ({ ...current, quotes: { ...current.quotes, ...outcome.quotes } }));
        }
        const parts: string[] = [];
        if (outcome.updated.length > 0) parts.push(`Updated ${outcome.updated.join(', ')}.`);
        if (outcome.skipped.length > 0) parts.push(`${outcome.skipped.join(', ')} already current.`);
        if (outcome.failed.length > 0) {
          parts.push(
            `Couldn't update ${outcome.failed.map((f) => `${f.ticker} — ${f.error}`).join('; ')}. ` +
              'Run "Test sources" below to see what each one did, or type a price in.',
          );
        }
        setPriceStatus({
          kind: outcome.failed.length > 0 && outcome.updated.length === 0 ? 'error' : 'ok',
          message: parts.join(' '),
        });
      } finally {
        setRefreshing(false);
      }
    },
    [today],
  );

  // Which source works from a given browser is not something this code can know,
  // so the page asks all of them and shows the answers.
  const runProbe = useCallback(
    async (ticker: string) => {
      setProbing(true);
      setProbeResults(null);
      try {
        setProbeResults({ ticker, rows: await probe(ticker, today) });
      } finally {
        setProbing(false);
      }
    },
    [today],
  );

  // Refresh what's already saved, once, when the app opens — the whole point of
  // a live price is that it is different every time you look. The ref guards
  // StrictMode's double-invoke in development.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void runRefresh(tickersIn(state.inflows), false);
    // Mount only: `state` here is deliberately the state loaded from storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runRefresh]);

  const setPrice = useCallback((ticker: string, priceCents: number) => {
    setState((current) => {
      const quotes = { ...current.quotes };
      // Clearing the field drops the price rather than pinning it at $0, which
      // would silently value the vest at nothing.
      if (priceCents <= 0) delete quotes[ticker];
      else quotes[ticker] = { priceCents, asOf: new Date().toISOString(), source: 'manual', via: null };
      return { ...current, quotes };
    });
    setPriceStatus(null);
  }, []);

  /* ---------- inflows ---------- */

  const updateCashInflow = useCallback((id: string, patch: Partial<CashInflow>) => {
    setState((current) => ({
      ...current,
      inflows: current.inflows.map((inflow) =>
        inflow.id === id && inflow.kind === 'cash' ? { ...inflow, ...patch, kind: 'cash' } : inflow,
      ),
    }));
  }, []);

  const updateRsuInflow = useCallback((id: string, patch: Partial<RsuInflow>) => {
    setState((current) => ({
      ...current,
      inflows: current.inflows.map((inflow) =>
        inflow.id === id && inflow.kind === 'rsu' ? { ...inflow, ...patch, kind: 'rsu' } : inflow,
      ),
    }));
  }, []);

  const removeInflow = useCallback((id: string) => {
    setState((current) => ({ ...current, inflows: current.inflows.filter((inflow) => inflow.id !== id) }));
  }, []);

  const addCashInflow = useCallback((name: string, date: IsoDate, amount: number) => {
    setState((current) => ({ ...current, inflows: [...current.inflows, createCashInflow(name, date, amount)] }));
  }, []);

  const addRsuInflow = useCallback(
    (name: string, date: IsoDate, ticker: string, units: number, taxRateBps: number) => {
      const inflow = createRsuInflow(name, date, ticker, units, taxRateBps);
      setState((current) => ({ ...current, inflows: [...current.inflows, inflow] }));
      // Adding a row is a deliberate commit, unlike typing in the ticker cell,
      // so it's the right moment to go and get a price.
      void runRefresh([inflow.ticker], false);
    },
    [runRefresh],
  );

  return (
    <main className="page">
      <header>
        <h1 className="page-title">Account Divider</h1>
        <p className="page-subtitle">
          Split a savings balance into named buckets, then project it forward through the money you
          expect to come in and go out.
        </p>
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
        <Summary balance={todayMilestone.cash} derived={todayMilestone.derived} />
      </section>

      <section className="card">
        <div className="section-head">
          <h2 className="section-title">Timeline</h2>
        </div>
        <Timeline projection={projection} today={today} quotes={state.quotes} />
      </section>

      <section className="card">
        <div className="section-head">
          <h2 className="section-title">Buckets</h2>
        </div>
        <BucketTable
          buckets={state.buckets}
          balance={todayMilestone.cash}
          onChange={updateBucket}
          onMove={reorderBucket}
          onRemove={removeBucket}
          onAdd={addBucket}
        />
      </section>

      <section className="card">
        <div className="section-head">
          <h2 className="section-title">Money coming in</h2>
        </div>
        <InflowTable
          inflows={state.inflows}
          quotes={state.quotes}
          tickers={tickers}
          today={today}
          refreshing={refreshing}
          priceStatus={priceStatus}
          probing={probing}
          probeResults={probeResults}
          onProbe={runProbe}
          onChangeCash={updateCashInflow}
          onChangeRsu={updateRsuInflow}
          onRemove={removeInflow}
          onAddCash={addCashInflow}
          onAddRsu={addRsuInflow}
          onSetPrice={setPrice}
          onRefreshPrices={() => void runRefresh(tickers, true)}
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
