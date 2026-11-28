import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { UpdateState } from '../types';
import { bridge } from '../hooks';

const DISMISS_KEY = 'osu-coach.update-dismissed';

function dismissedVersion(): string {
  try {
    return window.localStorage.getItem(DISMISS_KEY) || '';
  } catch {
    return '';
  }
}

function rememberDismissed(version: string) {
  try {
    window.localStorage.setItem(DISMISS_KEY, version);
  } catch {
    // private mode, whatever: the banner just comes back next launch
  }
}

const IDLE: UpdateState = { status: 'idle', version: '', percent: 0, error: '', checkedAt: 0, manual: false };

/**
 * A quiet plaque in the bottom corner, not a modal. It shows up when a release
 * is out, downloads only after a click, and never covers the app.
 */
export function UpdateBar() {
  const [state, setState] = useState<UpdateState>(IDLE);
  const [hidden, setHidden] = useState<string[]>([]);
  const [flash, setFlash] = useState('');
  const flashTimer = useRef(0);

  useEffect(() => {
    let alive = true;
    const apply = (next: UpdateState) => {
      if (!alive) return;
      setState(next);
      if (next.manual && next.status === 'current') {
        setFlash('это последняя версия');
        window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash(''), 4200);
      }
      if (next.manual && next.status === 'dev') {
        setFlash('в сборке обновления проверяются, в дев-режиме нет');
        window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash(''), 4200);
      }
      if (next.manual && next.status === 'error') {
        setFlash('не получилось проверить обновление — скорее всего нет сети');
        window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash(''), 6000);
      }
    };

    bridge.updates
      .state()
      .then(apply)
      .catch(() => {});
    const off = bridge.updates.onState(apply);
    return () => {
      alive = false;
      off();
      window.clearTimeout(flashTimer.current);
    };
  }, []);

  const dismiss = useCallback((version: string) => {
    if (version) {
      rememberDismissed(version);
      setHidden((prev) => (prev.includes(version) ? prev : [...prev, version]));
    }
    setFlash('');
  }, []);

  const visible =
    !flash &&
    (state.status === 'available' || state.status === 'downloading' || state.status === 'ready') &&
    !hidden.includes(state.version) &&
    !(state.status === 'available' && state.version === dismissedVersion());

  const checkAgain = async () => {
    setFlash('');
    const next = await bridge.updates.check();
    setState(next);
  };

  return (
    <AnimatePresence>
      {(visible || flash) && (
        <motion.div
          className={'update-bar' + (flash ? ' quiet' : '')}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 14, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {flash ? (
            <span className="update-flash">{flash}</span>
          ) : (
            <>
              <div className="update-text">
                <b>
                  {state.status === 'ready'
                    ? 'обновление скачано'
                    : state.status === 'downloading'
                      ? `качаю ${state.version}`
                      : `вышла версия ${state.version}`}
                </b>
                <span>
                  {state.status === 'ready'
                    ? 'перезапущусь на новую версию, настройки и данные останутся.'
                    : state.status === 'downloading'
                      ? `${state.percent}% · можно продолжать играть`
                      : 'скачается в фоне, поставится по кнопке.'}
                </span>
              </div>

              {state.status === 'downloading' && (
                <div className="update-progress">
                  <i style={{ width: `${Math.max(2, state.percent)}%` }} />
                </div>
              )}

              {state.status === 'available' && (
                <button className="btn update-go" onClick={() => void bridge.updates.download()}>
                  обновить
                </button>
              )}
              {state.status === 'ready' && (
                <button className="btn update-go" onClick={() => void bridge.updates.install()}>
                  перезапустить
                </button>
              )}

              <button className="update-close" title="позже" aria-label="скрыть" onClick={() => dismiss(state.version)}>
                ×
              </button>
            </>
          )}

          {flash && state.status === 'error' && state.manual && (
            <button className="update-retry" onClick={() => void checkAgain()}>
              ещё раз
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
