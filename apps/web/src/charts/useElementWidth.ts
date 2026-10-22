import { type RefObject, useLayoutEffect, useState } from 'react';

/** Tracks an element's content width so SVG charts can render at native resolution. */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    setWidth(element.clientWidth || fallback);
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width) || fallback);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, fallback]);
  return width;
}
