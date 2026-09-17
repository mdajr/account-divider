import type { Bucket, Quote } from '../types';
import type { Milestone, Projection, ValuedInflow } from '../timeline';
import { describeDistance, formatDate, type IsoDate } from '../dates';
import { formatDollars, formatPercentBps, formatPriceCents, formatUnits } from '../money';
import { slotColor } from '../palette';
import { useColorMode } from '../hooks';
import { AllocationBar } from './AllocationBar';

type Props = {
  projection: Projection;
  today: IsoDate;
  quotes: Record<string, Quote>;
};

/**
 * Identity is carried by the swatch+name pairs here and in the bucket table, so
 * a segment is never identified by color alone — which matters most on the
 * timeline, where the same eight hues repeat down thirty rows.
 */
function Legend({ buckets }: { buckets: readonly Bucket[] }) {
  const mode = useColorMode();
  const funded = buckets.filter((bucket) => bucket.amount > 0);
  if (funded.length === 0) return null;

  return (
    <ul className="legend">
      {funded.map((bucket) => (
        <li key={bucket.id}>
          <span
            className="legend-swatch"
            style={{ background: bucket.colorOverride ?? slotColor(bucket.colorSlot, mode) }}
            aria-hidden="true"
          />
          {bucket.name.trim() || 'Untitled'}
          {bucket.date && <span className="legend-date">→ {formatDate(bucket.date)}</span>}
        </li>
      ))}
    </ul>
  );
}

function arrivalDetail({ inflow }: ValuedInflow, quotes: Record<string, Quote>): string | null {
  if (inflow.kind !== 'rsu') return null;
  const quote = quotes[inflow.ticker];
  const price = quote ? formatPriceCents(quote.priceCents) : 'no price yet';
  return `${formatUnits(inflow.units)} ${inflow.ticker} @ ${price} · ${formatPercentBps(inflow.taxRateBps)} withheld`;
}

function MilestoneRow({ milestone, today, quotes }: { milestone: Milestone; today: IsoDate; quotes: Record<string, Quote> }) {
  const { derived, cash, pending, isToday, date, arrivals, departures } = milestone;

  return (
    <li className="milestone">
      <div className="milestone-mark" aria-hidden="true">
        <span className={isToday ? 'milestone-dot now' : 'milestone-dot'} />
      </div>

      <div className="milestone-body">
        <div className="milestone-head">
          <h3 className="milestone-title">{isToday ? 'Today' : formatDate(date)}</h3>
          <span className="milestone-when">{isToday ? formatDate(date) : describeDistance(today, date)}</span>
        </div>

        {(arrivals.length > 0 || departures.length > 0) && (
          <ul className="event-list">
            {arrivals.map(({ inflow, value }) => {
              const detail = arrivalDetail({ inflow, value }, quotes);
              return (
                <li key={inflow.id} className="event in">
                  <span className="event-amount">{value === null ? '+ ?' : `+ ${formatDollars(value)}`}</span>
                  <span className="event-name">{inflow.name.trim() || 'Unnamed deposit'}</span>
                  {detail && <span className="event-detail">{detail}</span>}
                </li>
              );
            })}
            {departures.map((bucket) => (
              <li key={bucket.id} className="event out">
                <span className="event-amount">− {formatDollars(bucket.amount)}</span>
                <span className="event-name">{bucket.name.trim() || 'Untitled'}</span>
                {bucket.note.trim() && <span className="event-detail">{bucket.note.trim()}</span>}
              </li>
            ))}
          </ul>
        )}

        <AllocationBar
          balance={cash}
          buckets={pending}
          derived={derived}
          variant={isToday ? 'full' : 'compact'}
          emptyMessage={isToday ? 'Enter a balance or add a bucket to see the split.' : undefined}
        />

        <p className="milestone-figures">
          <span className="figure">
            <span className="figure-label">On hand</span>
            <span className={cash < 0 ? 'figure-value over' : 'figure-value'}>{formatDollars(cash)}</span>
          </span>
          <span className="figure">
            <span className="figure-label">Reserved</span>
            <span className="figure-value">{formatDollars(derived.allocated)}</span>
          </span>
          <span className="figure">
            <span className="figure-label">Unallocated</span>
            <span className={derived.isOverAllocated ? 'figure-value over' : 'figure-value'}>
              {formatDollars(derived.unallocated)}
            </span>
          </span>
        </p>

        {derived.isOverAllocated && (
          <p className="milestone-warning">
            <span aria-hidden="true">⚠</span>
            Short by {formatDollars(Math.abs(derived.unallocated))} against what's still reserved.
          </p>
        )}
      </div>
    </li>
  );
}

export function Timeline({ projection, today, quotes }: Props) {
  const { milestones, unpricedTickers, backdatedCount } = projection;
  const buckets = milestones[0]?.pending ?? [];

  return (
    <div>
      <Legend buckets={buckets} />

      {milestones.length === 1 && (
        <p className="timeline-hint">
          Give a deposit or a bucket a date and it appears here as its own snapshot.
        </p>
      )}

      <ol className="timeline">
        {milestones.map((milestone) => (
          <MilestoneRow key={milestone.key} milestone={milestone} today={today} quotes={quotes} />
        ))}
      </ol>

      {unpricedTickers.length > 0 && (
        <p className="timeline-note warn">
          No price yet for {unpricedTickers.join(', ')} — those vests are counted as $0 until one
          loads. Refresh prices, or type one in.
        </p>
      )}
      {backdatedCount > 0 && (
        <p className="timeline-note">
          {backdatedCount} dated {backdatedCount === 1 ? 'entry is' : 'entries are'} on or before today, so
          {backdatedCount === 1 ? ' it is' : ' they are'} counted as already settled and folded into
          Today. Delete anything already reflected in your balance.
        </p>
      )}
    </div>
  );
}
