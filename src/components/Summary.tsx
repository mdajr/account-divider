import type { Derived } from '../state';
import { percentOf } from '../state';
import { formatDollars } from '../money';

type Props = { balance: number; derived: Derived };

/**
 * Unallocated is the hero — "what's left to spend" is the question this tool
 * exists to answer. Allocated rides alongside as a smaller stat rather than a
 * second hero, since a view gets exactly one.
 */
export function Summary({ balance, derived }: Props) {
  const { allocated, unallocated, isOverAllocated } = derived;

  return (
    <div className="summary">
      <div>
        <p className="hero-label">Unallocated</p>
        <p className={isOverAllocated ? 'hero-value over' : 'hero-value'}>{formatDollars(unallocated)}</p>
        {isOverAllocated && (
          <p className="warning">
            <span aria-hidden="true">⚠</span>
            Over-allocated by {formatDollars(Math.abs(unallocated))}
          </p>
        )}
      </div>

      <div>
        <p className="stat-label">Allocated</p>
        <p className="stat-value">{formatDollars(allocated)}</p>
        <p className="stat-note">
          {balance > 0 ? `${percentOf(allocated, balance).toFixed(1)}% of balance` : 'No balance set'}
        </p>
      </div>
    </div>
  );
}
