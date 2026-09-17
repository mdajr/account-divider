import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Bucket } from '../types';
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

/** The pixel span a marker's label actually occupies, given how it's anchored. */
function labelSpan(percent: number, text: string, trackWidth: number): [number, number] {
  const x = (percent / 100) * trackWidth;
  const width = textWidth(text);
  if (percent <= 12) return [x, x + width];
  if (percent >= 88) return [x - width, x];
  return [x - width / 2, x + width / 2];
}

/** 8px of daylight between two labels before they read as one smear. */
const LABEL_GAP = 8;

function collides(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] + LABEL_GAP && b[0] < a[1] + LABEL_GAP;
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

type Props = {
  /** Cash on hand for this snapshot — today's balance, or a projected one. */
  balance: number;
  /** The buckets still held at this point in time. */
  buckets: readonly Bucket[];
  derived: Derived;
  /**
   * `full` carries the marker rail and caption and anchors the view; `compact`
   * is the repeat used down the timeline, where a rail on every row would be
   * thirty copies of the same annotation.
   */
  variant?: 'full' | 'compact';
  /** Shown when there is nothing to draw. Omit to render nothing at all. */
  emptyMessage?: string;
};

export function AllocationBar({ balance, buckets, derived, variant = 'full', emptyMessage }: Props) {
  const mode = useColorMode();
  const trackRef = useRef<HTMLDivElement>(null);
  const trackWidth = useElementWidth(trackRef);
  const [hovered, setHovered] = useState<string | null>(null);

  const { allocated, unallocated, isOverAllocated, denominator } = derived;

  if (denominator <= 0) {
    return (
      <div className="bar-block">
        <div className="bar-empty" />
        {emptyMessage && <p className="bar-caption">{emptyMessage}</p>}
      </div>
    );
  }

  const segments: Segment[] = buckets
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
  const balancePercent = percentOf(balance, denominator);
  // Exactly equal: one marker with one combined label, rather than two lines of
  // overstruck text at the same pixel.
  const markersCoincide = allocated === balance;
  const allocatedLabel = `${formatDollars(allocated)} allocated`;
  const balanceLabel = `${formatDollars(balance)} balance`;
  // Measured in pixels, not percent: on a phone two markers 30 points apart
  // still overstrike each other, and a percentage tells you nothing about that.
  const markersClose =
    !markersCoincide &&
    trackWidth > 0 &&
    collides(
      labelSpan(allocatedPercent, allocatedLabel, trackWidth),
      labelSpan(balancePercent, balanceLabel, trackWidth),
    );

  const shareBase = balance > 0 ? balance : allocated;

  return (
    <div className="bar-block">
      {variant === 'full' && (
        <div className="marker-rail">
          {markersCoincide ? (
            <Marker percent={allocatedPercent} text={`${formatDollars(allocated)} — fully allocated`} />
          ) : (
            <>
              <Marker percent={allocatedPercent} text={allocatedLabel} critical={isOverAllocated} />
              {isOverAllocated && (
                <Marker percent={balancePercent} text={balanceLabel} raised={markersClose} />
              )}
            </>
          )}
        </div>
      )}

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

        {/* Marker stems continue through the bar so each reads as one line. The
            over-allocation lines stay on compact rows: that's the one thing a
            glance down the timeline has to catch. */}
        {markersCoincide ? (
          variant === 'full' && <span className="bar-overlay" style={{ left: `${allocatedPercent}%` }} />
        ) : (
          <>
            {(variant === 'full' || isOverAllocated) && (
              <span
                className={isOverAllocated ? 'bar-overlay critical' : 'bar-overlay'}
                style={{ left: `${allocatedPercent}%` }}
              />
            )}
            {isOverAllocated && <span className="bar-overlay" style={{ left: `${balancePercent}%` }} />}
          </>
        )}
      </div>
    </div>
  );
}
