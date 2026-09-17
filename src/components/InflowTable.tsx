import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { CashInflow, Inflow, Quote, RsuInflow } from '../types';
import { isIsoDate, type IsoDate } from '../dates';
import {
  formatDollars,
  formatPercentBps,
  formatUnits,
  parseDollars,
  parseErrorMessage,
  parsePercentBps,
  parsePriceCents,
  parseUnits,
} from '../money';
import { normalizeTicker } from '../state';
import { valueInflow } from '../timeline';
import { AmountInput } from './AmountInput';
import { DateField } from './DateField';
import { ValueField } from './ValueField';

/* Module-scope so their identity is stable across renders. */
const unitsDisplay = (units: number) => (units === 0 ? '' : formatUnits(units));
const rateDisplay = (bps: number) => (bps === 0 ? '' : formatPercentBps(bps).replace('%', ''));
const priceDisplay = (cents: number) => (cents === 0 ? '' : (cents / 100).toFixed(2));

export type PriceStatus = { kind: 'ok' | 'error'; message: string } | null;

type Props = {
  inflows: Inflow[];
  quotes: Record<string, Quote>;
  tickers: string[];
  today: IsoDate;
  refreshing: boolean;
  priceStatus: PriceStatus;
  onChangeCash: (id: string, patch: Partial<CashInflow>) => void;
  onChangeRsu: (id: string, patch: Partial<RsuInflow>) => void;
  onRemove: (id: string) => void;
  onAddCash: (name: string, date: IsoDate, amount: number) => void;
  onAddRsu: (name: string, date: IsoDate, ticker: string, units: number, taxRateBps: number) => void;
  onSetPrice: (ticker: string, priceCents: number) => void;
  onRefreshPrices: () => void;
};

const onEnter = (submit: () => void) => (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submit();
  }
};

export function InflowTable({
  inflows,
  quotes,
  tickers,
  today,
  refreshing,
  priceStatus,
  onChangeCash,
  onChangeRsu,
  onRemove,
  onAddCash,
  onAddRsu,
  onSetPrice,
  onRefreshPrices,
}: Props) {
  const cash = inflows.filter((inflow): inflow is CashInflow => inflow.kind === 'cash');
  const rsus = inflows.filter((inflow): inflow is RsuInflow => inflow.kind === 'rsu');

  return (
    <div className="inflows">
      <CashSection rows={cash} today={today} onChange={onChangeCash} onRemove={onRemove} onAdd={onAddCash} />
      <RsuSection
        rows={rsus}
        quotes={quotes}
        onChange={onChangeRsu}
        onRemove={onRemove}
        onAdd={onAddRsu}
      />
      <PriceSection
        tickers={tickers}
        quotes={quotes}
        refreshing={refreshing}
        status={priceStatus}
        onSetPrice={onSetPrice}
        onRefresh={onRefreshPrices}
      />
    </div>
  );
}

/* ---------- cash deposits ---------- */

type CashSectionProps = {
  rows: CashInflow[];
  today: IsoDate;
  onChange: (id: string, patch: Partial<CashInflow>) => void;
  onRemove: (id: string) => void;
  onAdd: (name: string, date: IsoDate, amount: number) => void;
};

function CashSection({ rows, today, onChange, onRemove, onAdd }: CashSectionProps) {
  const [name, setName] = useState('');
  const [date, setDate] = useState<IsoDate | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('Give the deposit a name');
    if (!isIsoDate(date)) return setError('Pick the date you expect it');
    const parsed = parseDollars(amount);
    if (!parsed.ok) return setError(parseErrorMessage(parsed.reason));
    onAdd(trimmed, date, parsed.value);
    setName('');
    setDate(null);
    setAmount('');
    setError(null);
  };

  return (
    <section className="subsection">
      <h3 className="subsection-title">Cash deposits</h3>
      <p className="subsection-note">
        A known sum on a known day — a security deposit refund, a tax refund, a bonus.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Deposit</th>
              <th>Expected</th>
              <th className="right">Amount</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="empty-row" colSpan={4}>
                  No deposits yet.
                </td>
              </tr>
            )}

            {rows.map((row) => (
              <tr key={row.id}>
                <td className="col-name">
                  <label className="visually-hidden" htmlFor={`cash-name-${row.id}`}>
                    Deposit name
                  </label>
                  <input
                    id={`cash-name-${row.id}`}
                    type="text"
                    value={row.name}
                    placeholder="Deposit name"
                    onChange={(event) => onChange(row.id, { name: event.target.value })}
                  />
                </td>
                <td className="col-date">
                  <DateField
                    id={`cash-date-${row.id}`}
                    label={`Date for ${row.name || 'deposit'}`}
                    value={row.date}
                    onChange={(next) => next && onChange(row.id, { date: next })}
                  />
                </td>
                <td className="col-amount">
                  <AmountInput
                    id={`cash-amount-${row.id}`}
                    label={`Amount for ${row.name || 'deposit'}`}
                    value={row.amount}
                    onChange={(next) => onChange(row.id, { amount: next })}
                  />
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon danger"
                      onClick={() => onRemove(row.id)}
                      aria-label={`Delete ${row.name || 'deposit'} (${formatDollars(row.amount)})`}
                      title="Delete deposit"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            <tr className="add-row">
              <td className="col-name">
                <label className="visually-hidden" htmlFor="new-cash-name">
                  New deposit name
                </label>
                <input
                  id="new-cash-name"
                  type="text"
                  value={name}
                  placeholder="Tax refund"
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={onEnter(submit)}
                />
              </td>
              <td className="col-date">
                <DateField
                  id="new-cash-date"
                  label="New deposit date"
                  value={date}
                  onChange={(next) => {
                    setDate(next);
                    setError(null);
                  }}
                />
              </td>
              <td className="col-amount">
                <label className="visually-hidden" htmlFor="new-cash-amount">
                  New deposit amount
                </label>
                <input
                  id="new-cash-amount"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="numeric"
                  value={amount}
                  placeholder="$0"
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={onEnter(submit)}
                />
              </td>
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
                <td colSpan={4}>
                  <p className="field-error" role="alert">
                    {error}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="subsection-hint">Today is {today}. Anything dated on or before today counts as already settled.</p>
    </section>
  );
}

/* ---------- RSU vests ---------- */

type RsuSectionProps = {
  rows: RsuInflow[];
  quotes: Record<string, Quote>;
  onChange: (id: string, patch: Partial<RsuInflow>) => void;
  onRemove: (id: string) => void;
  onAdd: (name: string, date: IsoDate, ticker: string, units: number, taxRateBps: number) => void;
};

function RsuSection({ rows, quotes, onChange, onRemove, onAdd }: RsuSectionProps) {
  const [name, setName] = useState('');
  const [date, setDate] = useState<IsoDate | null>(null);
  const [ticker, setTicker] = useState('');
  const [units, setUnits] = useState('');
  const [rate, setRate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmedName = name.trim();
    const trimmedTicker = normalizeTicker(ticker);
    if (!trimmedTicker) return setError('Enter a ticker');
    if (!isIsoDate(date)) return setError('Pick the vest date');
    const parsedUnits = parseUnits(units);
    if (!parsedUnits.ok) return setError(parseErrorMessage(parsedUnits.reason, 'units'));
    const parsedRate = parsePercentBps(rate);
    if (!parsedRate.ok) return setError(parseErrorMessage(parsedRate.reason, 'percent'));

    onAdd(trimmedName || `${trimmedTicker} vest`, date, trimmedTicker, parsedUnits.value, parsedRate.value);
    setName('');
    setDate(null);
    setTicker('');
    setUnits('');
    setRate('');
    setError(null);
  };

  return (
    <section className="subsection">
      <h3 className="subsection-title">RSU vests</h3>
      <p className="subsection-note">
        Valued at the latest share price, less withholding — so the estimate moves with the stock.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Vest</th>
              <th>Date</th>
              <th>Ticker</th>
              <th className="right">Units</th>
              <th className="right">Tax %</th>
              <th className="right">Est. net</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="empty-row" colSpan={7}>
                  No vests yet.
                </td>
              </tr>
            )}

            {rows.map((row) => {
              const net = valueInflow(row, quotes);
              return (
                <tr key={row.id}>
                  <td className="col-name">
                    <label className="visually-hidden" htmlFor={`rsu-name-${row.id}`}>
                      Vest name
                    </label>
                    <input
                      id={`rsu-name-${row.id}`}
                      type="text"
                      value={row.name}
                      placeholder="Vest name"
                      onChange={(event) => onChange(row.id, { name: event.target.value })}
                    />
                  </td>
                  <td className="col-date">
                    <DateField
                      id={`rsu-date-${row.id}`}
                      label={`Date for ${row.name || 'vest'}`}
                      value={row.date}
                      onChange={(next) => next && onChange(row.id, { date: next })}
                    />
                  </td>
                  <td className="col-ticker">
                    <label className="visually-hidden" htmlFor={`rsu-ticker-${row.id}`}>
                      Ticker for {row.name || 'vest'}
                    </label>
                    <input
                      id={`rsu-ticker-${row.id}`}
                      type="text"
                      value={row.ticker}
                      placeholder="AAPL"
                      autoCapitalize="characters"
                      onChange={(event) => onChange(row.id, { ticker: normalizeTicker(event.target.value) })}
                    />
                  </td>
                  <td className="col-units">
                    <ValueField
                      id={`rsu-units-${row.id}`}
                      label={`Units for ${row.name || 'vest'}`}
                      value={row.units}
                      parse={parseUnits}
                      format={unitsDisplay}
                      kind="units"
                      onChange={(next) => onChange(row.id, { units: next })}
                    />
                  </td>
                  <td className="col-rate">
                    <ValueField
                      id={`rsu-rate-${row.id}`}
                      label={`Tax rate for ${row.name || 'vest'}`}
                      value={row.taxRateBps}
                      parse={parsePercentBps}
                      format={rateDisplay}
                      kind="percent"
                      onChange={(next) => onChange(row.id, { taxRateBps: next })}
                    />
                  </td>
                  <td className="numeric">
                    {net === null ? <span className="muted">no price</span> : formatDollars(net)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon danger"
                        onClick={() => onRemove(row.id)}
                        aria-label={`Delete ${row.name || 'vest'}`}
                        title="Delete vest"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            <tr className="add-row">
              <td className="col-name">
                <label className="visually-hidden" htmlFor="new-rsu-name">
                  New vest name
                </label>
                <input
                  id="new-rsu-name"
                  type="text"
                  value={name}
                  placeholder="Q1 vest (optional)"
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={onEnter(submit)}
                />
              </td>
              <td className="col-date">
                <DateField
                  id="new-rsu-date"
                  label="New vest date"
                  value={date}
                  onChange={(next) => {
                    setDate(next);
                    setError(null);
                  }}
                />
              </td>
              <td className="col-ticker">
                <label className="visually-hidden" htmlFor="new-rsu-ticker">
                  New vest ticker
                </label>
                <input
                  id="new-rsu-ticker"
                  type="text"
                  value={ticker}
                  placeholder="AAPL"
                  autoCapitalize="characters"
                  onChange={(event) => {
                    setTicker(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={onEnter(submit)}
                />
              </td>
              <td className="col-units">
                <label className="visually-hidden" htmlFor="new-rsu-units">
                  New vest units
                </label>
                <input
                  id="new-rsu-units"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  className="numeric"
                  value={units}
                  placeholder="100"
                  onChange={(event) => {
                    setUnits(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={onEnter(submit)}
                />
              </td>
              <td className="col-rate">
                <label className="visually-hidden" htmlFor="new-rsu-rate">
                  New vest tax rate
                </label>
                <input
                  id="new-rsu-rate"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  className="numeric"
                  value={rate}
                  placeholder="22"
                  onChange={(event) => {
                    setRate(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={onEnter(submit)}
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
    </section>
  );
}

/* ---------- share prices ---------- */

type PriceSectionProps = {
  tickers: string[];
  quotes: Record<string, Quote>;
  refreshing: boolean;
  status: PriceStatus;
  onSetPrice: (ticker: string, priceCents: number) => void;
  onRefresh: () => void;
};

function PriceSection({ tickers, quotes, refreshing, status, onSetPrice, onRefresh }: PriceSectionProps) {
  if (tickers.length === 0) return null;

  return (
    <section className="subsection">
      <div className="section-head">
        <h3 className="subsection-title">Share prices</h3>
        <button type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh prices'}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th className="right">Price</th>
              <th>As of</th>
            </tr>
          </thead>
          <tbody>
            {tickers.map((ticker) => {
              const quote = quotes[ticker];
              return (
                <tr key={ticker}>
                  <td className="ticker-cell">{ticker}</td>
                  <td className="col-amount">
                    <ValueField
                      id={`price-${ticker}`}
                      label={`Share price for ${ticker}`}
                      value={quote?.priceCents ?? 0}
                      parse={parsePriceCents}
                      format={priceDisplay}
                      kind="price"
                      placeholder="0.00"
                      onChange={(cents) => onSetPrice(ticker, cents)}
                    />
                  </td>
                  <td className="as-of">
                    {quote ? (
                      <>
                        {new Date(quote.asOf).toLocaleString()}
                        <span className="source-tag">{quote.source === 'manual' ? 'entered by you' : 'stooq'}</span>
                      </>
                    ) : (
                      <span className="muted">not fetched yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {status && (
        <p className={status.kind === 'error' ? 'transfer-status error' : 'transfer-status'} role="status">
          {status.message}
        </p>
      )}
      <p className="subsection-hint">
        Prices come from stooq.com and are delayed. A price you type yourself is kept until you hit
        Refresh, which always re-fetches every ticker.
      </p>
    </section>
  );
}
