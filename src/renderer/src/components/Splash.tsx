import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { loadingTips } from '../tips';
import { BrandMark } from './BrandMark';

/**
 * First paint. The database scan takes a moment, and until it finishes the app
 * has nothing honest to show, so it shows what it is doing and a useful line.
 */
export function Splash({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * loadingTips.length));

  useEffect(() => {
    if (error) return;
    const id = window.setInterval(() => setIndex((value) => (value + 1) % loadingTips.length), 4200);
    return () => window.clearInterval(id);
  }, [error]);

  return (
    <motion.div
      className="splash"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
    >
      <div className="splash-inner">
        <motion.div
          className="splash-mark"
          initial={{ scale: 0.86, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        >
          <BrandMark size={64} />
        </motion.div>

        <div className="splash-name">osu! coach</div>

        {error ? (
          <>
            <p className="splash-error">{error}</p>
            {onRetry && (
              <button className="btn ghost" onClick={onRetry}>
                попробовать ещё раз
              </button>
            )}
          </>
        ) : (
          <>
            <div className="splash-status">
              <span className="splash-dots">
                <i />
                <i />
                <i />
              </span>
              читаю базу osu!
            </div>

            <div className="splash-tip">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={index}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                >
                  {loadingTips[index]}
                </motion.span>
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
