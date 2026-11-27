import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Bootstrap } from '../types';
import { buildGreeting } from '../greetings';
import { BrandMark } from './BrandMark';

/**
 * A full-screen hello for this launch, shown once over the app, then it lifts
 * and the interface is already there. The line is built from local data only.
 */
export function Greeting({ boot, onClose }: { boot: Bootstrap; onClose: () => void }) {
  const [greeting] = useState(() => buildGreeting(boot));

  useEffect(() => {
    const id = window.setTimeout(onClose, 2800);
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
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      >
        <BrandMark size={72} />
      </motion.span>
      <motion.b
        className="greeting-title"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4, ease: 'easeOut' }}
      >
        {greeting.title}
      </motion.b>
      <motion.span
        className="greeting-sub"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.4, ease: 'easeOut' }}
      >
        {greeting.sub}
      </motion.span>
    </motion.div>
  );
}
