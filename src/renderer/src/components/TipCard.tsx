import { AnimatePresence, motion } from 'framer-motion';
import type { Tip } from '../tips';
import type { Tab } from './TitleBar';
import { IconArrowRight, IconRefresh, IconSpark } from './Icons';

export function TipCard({
  tip,
  onNext,
  onGo,
  variant = 'card',
}: {
  tip: Tip;
  onNext?: () => void;
  onGo?: (tab: Tab) => void;
  variant?: 'card' | 'inline';
}) {
  return (
    <div className={'tip tip-' + tip.tone + (variant === 'inline' ? ' tip-inline' : ' card tip-card')}>
      <div className="tip-head">
        <span className="tip-badge">
          <IconSpark size={11} /> совет
        </span>
        {onNext && (
          <button className="tip-next" onClick={onNext} title="Показать другой совет">
            <IconRefresh size={12} /> другой
          </button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tip.id}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
        >
          <b className="tip-title">{tip.title}</b>
          <p className="tip-text">{tip.body}</p>
        </motion.div>
      </AnimatePresence>

      {tip.action && onGo && (
        <button className="tip-go" onClick={() => onGo(tip.action!.tab)}>
          {tip.action.label} <IconArrowRight size={13} />
        </button>
      )}
    </div>
  );
}
