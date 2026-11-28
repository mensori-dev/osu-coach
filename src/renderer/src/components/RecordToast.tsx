import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { RecordEvent } from '../types';
import { bridge } from '../hooks';
import { fmtNum } from '../utils';

/**
 * «личный рекорд» — the hook that makes the next play matter. It stays in the
 * app, bottom-left, and never asks for anything: no system notifications.
 */
export function RecordToast() {
  const [queue, setQueue] = useState<RecordEvent[]>([]);
  const timer = useRef(0);

  useEffect(() => {
    const off = bridge.onRecord((records) => {
      if (!records?.length) return;
      setQueue((prev) => [...prev, ...records].slice(-3));
    });
    return () => {
      off();
      window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!queue.length) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setQueue((prev) => prev.slice(1)), 6500);
    return () => window.clearTimeout(timer.current);
  }, [queue]);

  const record = queue[0];

  return (
    <AnimatePresence>
      {record && (
        <motion.div
          className="record-toast"
          key={`${record.mapId}-${record.at}`}
          initial={{ opacity: 0, x: -18, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -14, scale: 0.98 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="record-toast-mark">★</span>
          <div className="record-toast-text">
            <b>личный рекорд</b>
            <span>
              {record.title} <i>[{record.diff}]</i> · {fmtNum(record.acc, 2)}%
            </span>
          </div>
          <span className="record-toast-delta">+{fmtNum(record.acc - record.prev, 2)}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
