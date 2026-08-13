import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AppState } from '../types';
import type { Derived } from '../state';
import { percentOf } from '../state';
import { formatDollars } from '../money';
import { inkOn, slotColor, UNALLOCATED_COLOR } from '../palette';
import { useColorMode, useElementWidth } from '../hooks';

const LABEL_FONT = '500 12px system-ui, -apple-system, "Segoe UI", sans-serif';
/** 8px padding each side plus the 2px separator. */
const LABEL_CHROME = 20;

let measureContext: CanvasRenderingContext2D | null = null;

function textWidth(text: string): number {
  if (!measureContext) {
    const canvas = document.createElement('canvas');
    measureContext = canvas.getContext('2d');
    if (measureContext) measureContext.font = LABEL_FONT;
  }
  if (!measureContext) return text.length * 7;
  return measureContext.measureText(text).width;
}

type Segment = {
  key: string;
  label: string;
  amount: number;
  color: string;
  percent: number;
};

/** Where a marker's label sits so it never hangs off the end of the track. */
function anchorFor(percent: number): CSSProperties {
  if (percent <= 12) return { transform: 'translateX(0)' };
  if (percent >= 88) return { transform: 'translateX(-100%)' };
  return { transform: 'translateX(-50%)' };
}

type MarkerProps = {
  percent: number;
  text: string;
  critical?: boolean;
  raised?: boolean;
};

function Marker({ percent, text, critical = false, raised = false }: MarkerProps) {
  return (
    <div className="marker" style={{ left: `${percent}%` }}>
      <span className={critical ? 'marker-text critical' : 'marker-text'} style={anchorFor(percent)}>
        {text}
      </span>
      <span className="marker-stem" style={{ height: raised ? 22 : 8 }} />
    </div>
  );
}

type Props = { state: AppState; derived: Derived };

export function AllocationBar({ state, derived }: Props) {
  const mode = useColorMode();
  const trackRef = useRef<HTMLDivElement>(null);
  const trackWidth = useElementWidth(trackRef);
  const [hovered, setHovered] = useState<string | null>(null);

  const { allocated, unallocated, isOverAllocated, denominator } = derived;

  if (denominator <= 0) {
    return (
      <div className="bar-block">
        <div className="bar-empty" />
        <p className="bar-caption">Enter a balance or add a bucket to see the split.</p>
      </div>
    );
  }

  const segments: Segment[] = state.buckets
    .filter((bucket) => bucket.amount > 0)
    .map((bucket) => ({
      key: bucket.id,
      label: bucket.name.trim() || 'Untitled',
      amount: bucket.amount,
      color: bucket.colorOverride ?? slotColor(bucket.colorSlot, mode),
      percent: percentOf(bucket.amount, denominator),
    }));

  if (unallocated > 0) {
    segments.push({
      key: '__unallocated',
      label: 'Unallocated',
      amount: unallocated,
      color: UNALLOCATED_COLOR[mode],
      percent: percentOf(unallocated, denominator),
    });
  }

  const allocatedPercent = percentOf(allocated, denominator);
  const balancePercent = percentOf(state.balance, denominator);
  // Exactly equal: one marker with one combined label, rather than two lines of
  // overstruck text at the same pixel.
  const markersCoincide = allocated === state.balance;
  // Close but not equal: stagger onto two rows so the labels don't collide.
  const markersClose = !markersCoincide && Math.abs(allocatedPercent - balancePercent) < 22;

  const shareBase = state.balance > 0 ? state.balance : allocated;

  return (
    <div className="bar-block">
      <div className="marker-rail">
        {markersCoincide ? (
          <Marker percent={allocatedPercent} text={`${formatDollars(allocated)} — fully allocated`} />
        ) : (
          <>
            <Marker
              percent={allocatedPercent}
              text={`${formatDollars(allocated)} allocated`}
              critical={isOverAllocated}
            />
            {isOverAllocated && (
              <Marker
                percent={balancePercent}
                text={`${formatDollars(state.balance)} balance`}
                raised={markersClose}
              />
            )}
          </>
        )}
      </div>

      <div className="bar-track" ref={trackRef}>
        {segments.map((segment) => {
          const segmentWidth = (segment.percent / 100) * trackWidth;
          // Only label where the text genuinely fits — never clip it.
          const showLabel = trackWidth > 0 && segmentWidth >= textWidth(segment.label) + LABEL_CHROME;
          const share = percentOf(segment.amount, shareBase);
          return (
            <div
              key={segment.key}
              className="bar-segment"
              style={{ width: `${segment.percent}%`, background: segment.color }}
              onMouseEnter={() => setHovered(segment.key)}
              onMouseLeave={() => setHovered((current) => (current === segment.key ? null : current))}
            >
              {showLabel && (
                <span className="bar-segment-label" style={{ color: inkOn(segment.color) }}>
                  {segment.label}
                </span>
              )}
              {hovered === segment.key && (
                <span className="tooltip" role="status">
                  {segment.label} · {formatDollars(segment.amount)} · {share.toFixed(1)}%
                </span>
              )}
            </div>
          );
        })}

        {/* Marker stems continue through the bar so each reads as one line. */}
        {markersCoincide ? (
          <span className="bar-overlay" style={{ left: `${allocatedPercent}%` }} />
        ) : (
          <>
            <span
              className={isOverAllocated ? 'bar-overlay critical' : 'bar-overlay'}
              style={{ left: `${allocatedPercent}%` }}
            />
            {isOverAllocated && <span className="bar-overlay" style={{ left: `${balancePercent}%` }} />}
          </>
        )}
      </div>

      <p className="bar-caption">
        {isOverAllocated
          ? `Buckets total ${formatDollars(allocated)} against a ${formatDollars(state.balance)} balance.`
          : `${formatDollars(allocated)} of ${formatDollars(state.balance)} allocated across ${state.buckets.length} ${
              state.buckets.length === 1 ? 'bucket' : 'buckets'
            }.`}
      </p>
    </div>
  );
}
