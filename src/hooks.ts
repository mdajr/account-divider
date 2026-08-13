import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { ColorMode } from './palette';

/** Follows the OS setting. Tokens are structured so a manual toggle can be
 *  added later without touching component code. */
export function useColorMode(): ColorMode {
  const [mode, setMode] = useState<ColorMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setMode(e.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return mode;
}

/** Live pixel width of an element — the bar needs real pixels to decide whether
 *  a segment label actually fits, since a percentage tells you nothing. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
