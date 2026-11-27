import { useEffect, useRef, useState } from 'react';
import type { Bridge, LivePayload } from './types';
import { createMockBridge } from './mock';

export const bridge: Bridge = (window as unknown as { api?: Bridge }).api ?? createMockBridge();

export const isBrowserPreview = !(window as unknown as { api?: Bridge }).api;

/** Smoothly animates a number towards its target without re-mounting. */
export function useTween(target: number, factor = 0.16): number {
  const [value, setValue] = useState(target);
  const targetRef = useRef(target);
  const valueRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const goal = targetRef.current;
      const diff = goal - valueRef.current;
      if (Math.abs(diff) < 0.004) {
        if (valueRef.current !== goal) {
          valueRef.current = goal;
          setValue(goal);
        }
      } else {
        valueRef.current += diff * factor;
        setValue(valueRef.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [factor]);

  return value;
}

export function useLive(): LivePayload | null {
  const [live, setLive] = useState<LivePayload | null>(null);
  useEffect(() => bridge.onLive(setLive), []);
  return live;
}

export function useNow(interval = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}
