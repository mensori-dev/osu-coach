import { motion } from 'framer-motion';
import type { LivePayload } from '../types';
import { BrandMark } from './BrandMark';
import { IconClose, IconMinus, IconSquare } from './Icons';

export type Tab = 'live' | 'plays' | 'plan' | 'dash' | 'maps' | 'profile' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: 'Лайв' },
  { id: 'plays', label: 'Разборы' },
  { id: 'plan', label: 'План' },
  { id: 'dash', label: 'Прогресс' },
  { id: 'maps', label: 'Карты' },
  { id: 'profile', label: 'Профиль' },
  { id: 'settings', label: 'Настройки' },
];

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
  live: LivePayload | null;
  demo: boolean;
  onDemo: (on: boolean) => void;
}

export function TitleBar({ tab, onTab, live, demo, onDemo }: Props) {
  const connected = Boolean(live?.tosu.connected);
  const status = demo
    ? { tone: 'demo', text: 'демо-режим' }
    : connected
      ? { tone: 'live', text: 'tosu на связи' }
      : { tone: 'off', text: 'tosu выключен' };

  return (
    <header className="titlebar">
      <div className="brand">
        <span className="brand-mark">
          <BrandMark size={24} />
        </span>
        <span>
          osu!<em>coach</em>
        </span>
        <small>live</small>
      </div>

      <nav className="tabs">
        {TABS.map((item) => (
          <button key={item.id} className={'tab' + (tab === item.id ? ' active' : '')} onClick={() => onTab(item.id)}>
            {tab === item.id && (
              <motion.span
                layoutId="tab-indicator"
                className="tab-indicator"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span style={{ position: 'relative' }}>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="spacer" />

      <button
        className="status-pill"
        onClick={() => onDemo(!demo)}
        title={demo ? 'Выключить демо-режим' : 'Включить демо-режим'}
      >
        <i className={'dot ' + status.tone} />
        <span className="status-text">{status.text}</span>
      </button>

      <div className="win-controls">
        <button className="win-btn" onClick={() => window.api?.win.min()} aria-label="Свернуть">
          <IconMinus />
        </button>
        <button className="win-btn" onClick={() => window.api?.win.max()} aria-label="Развернуть">
          <IconSquare />
        </button>
        <button className="win-btn close" onClick={() => window.api?.win.close()} aria-label="Закрыть">
          <IconClose />
        </button>
      </div>
    </header>
  );
}
