import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Bootstrap } from '../types';
import { buildGreeting } from '../greetings';
import { BrandMark } from './BrandMark';

const DURATION = 3800;

/**
 * A full-screen hello for this launch, shown once over the app, then it lifts
 * and the interface is already there. It leaves on its own after a beat — long
 * enough to read, short enough not to wait — and a click skips it right away.
 */
export function Greeting({ boot, onClose }: { boot: Bootstrap; onClose: () => void }) {
  const [greeting] = useState(() => buildGreeting(boot));

  useEffect(() => {
    const id = window.setTimeout(onClose, DURATION);
    return () => window.clearTimeout(id);
  }, [onClose]);

  return (
    <motion.div
      className="greeting"
      onClick={onClose}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      <motion.span
        className="greeting-mark"
        initial={{ scale: 0.7, opacity: 0, rotate: -12 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16 }}
      >
        <BrandMark size={72} />
      </motion.span>
      <motion.b
        className="greeting-title"
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 22 }}
      >
        {greeting.title}
      </motion.b>
      <motion.span
        className="greeting-sub"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, duration: 0.4, ease: 'easeOut' }}
      >
        {greeting.sub}
      </motion.span>

      <span className="greeting-bar">
        <motion.i
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: DURATION / 1000, ease: 'linear' }}
        />
      </span>
      <span className="greeting-hint">клик — сразу дальше</span>
    </motion.div>
  );
}
