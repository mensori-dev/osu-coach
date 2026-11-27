import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Bootstrap, FreshPlay, Settings } from './types';
import { bridge, useLive } from './hooks';
import { TitleBar, type Tab } from './components/TitleBar';
import { LiveView } from './components/LiveView';
import { Dashboard } from './components/Dashboard';
import { SettingsView } from './components/SettingsView';
import { MapFinder } from './components/MapFinder';
import { ProfileView } from './components/ProfileView';
import { PlaysView } from './components/PlaysView';
import { PlanView } from './components/PlanView';
import { Onboarding } from './components/Onboarding';
import { Splash } from './components/Splash';
import { Greeting } from './components/Greeting';
import { Tutorial } from './components/Tutorial';
import { accentStyle, themeCover, themeStyle } from './theme';
import { useCoverAccent } from './components/accent';

export default function App() {
  const [tab, setTab] = useState<Tab>('live');
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const [tour, setTour] = useState(false);
  const [greet, setGreet] = useState(true);
  const [maxed, setMaxed] = useState(false);
  const live = useLive();

  const load = useCallback(() => {
    bridge
      .bootstrap()
      .then(setBoot)
      .catch((err) => setBootError(String(err instanceof Error ? err.message : err)));
  }, []);

  useEffect(() => {
    load();
    // A splash that vanishes in 80 ms reads as a glitch, not as loading.
    const id = window.setTimeout(() => setMinElapsed(true), 900);
    return () => window.clearTimeout(id);
  }, [load]);

  // The main process watches scores.db and pushes a fresh bootstrap whenever a
  // play lands, so every tab moves on its own.
  useEffect(() => bridge.onData(setBoot), []);

  // Rounded corners belong to a floating window; a maximized or fullscreen one
  // fills the screen and should be square.
  useEffect(() => window.api?.win.onFrame?.((state) => setMaxed(state.maximized || state.fullscreen)), []);

  // F11 toggles a true fullscreen (covers the taskbar), like the titlebar button.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F11') {
        event.preventDefault();
        window.api?.win.full();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const patch = useCallback(async (next: Partial<Settings>) => {
    setBoot((prev) => (prev ? { ...prev, settings: { ...prev.settings, ...next } } : prev));
    const saved = await bridge.setSettings(next);
    setBoot((prev) => (prev ? { ...prev, settings: saved } : prev));
  }, []);

  const rescan = useCallback(async () => {
    await bridge.scan();
    const fresh = await bridge.bootstrap();
    setBoot(fresh);
  }, []);

  const refreshApi = useCallback(async () => {
    const api = await bridge.refreshApi();
    setBoot((prev) => (prev ? { ...prev, api } : prev));
  }, []);

  // The tour shows itself once, right after onboarding. The «?» in the titlebar
  // brings it back any time. «Seen» is stored the moment it closes.
  const closeTour = useCallback(() => {
    setTour(false);
    setGreet(false);
    if (boot && !boot.settings.tutorialSeen) void patch({ tutorialSeen: true });
  }, [boot, patch]);

  // Stable identity: the greeting must lift on its own even while live data
  // re-renders the tree every second.
  const closeGreet = useCallback(() => setGreet(false), []);

  const autoTour = Boolean(boot?.settings.onboarded && !boot?.settings.tutorialSeen);
  // Order on a fresh device: onboarding → full-screen hello → the UI with the tour.
  // The tour waits for the hello to lift so the two never overlap.
  const tourOpen = tour || (autoTour && !greet && minElapsed);

  // osu! flushes scores.db when it leaves the results screen, not the moment a
  // map ends. Keep the finished run in memory until the db catches up.
  const [fresh, setFresh] = useState<FreshPlay | null>(null);
  const prevState = useRef<string | null>(null);
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const liveState = live?.state ?? null;
  useEffect(() => {
    const wasResults = prevState.current === 'results';
    prevState.current = liveState;

    if (liveState === 'results') {
      const current = liveRef.current;
      if (!wasResults && current?.beatmap && current?.play) {
        setFresh({
          id: current.beatmap.id,
          title: current.beatmap.title,
          artist: current.beatmap.artist,
          diff: current.beatmap.version,
          mapper: current.beatmap.mapper,
          stars: current.beatmap.stars,
          acc: current.play.accuracy,
          mods: current.play.mods,
          combo: current.play.combo,
          miss: current.play.hits.miss,
          at: Date.now(),
          setId: current.beatmap.setId,
          bpm: current.beatmap.bpm,
          ar: current.beatmap.ar,
          drainTime: Math.round(current.beatmap.lengthMs / 1000),
        });
      }
      // The db is flushed on leaving results, but the exact moment differs per
      // install. Try a few times; the folder watcher is the safety net.
      void rescan();
      const timers = [2500, 7000, 16000].map((ms) => window.setTimeout(() => void rescan(), ms));
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }

    if (wasResults) void rescan();
  }, [liveState, rescan]);

  const payload = live ?? boot?.live ?? null;
  const demo = Boolean(boot?.settings.demo);
  const theme = boot?.settings.theme ?? 'cover';

  // «обложка» follows the live map, or the last one played when nothing is running.
  const accentCover = theme === 'cover' ? themeCover(boot, payload) : null;
  const coverAccent = useCoverAccent(accentCover);
  const appStyle = themeStyle(theme) ?? (coverAccent ? accentStyle(coverAccent.a, coverAccent.b) : undefined);

  return (
    <div className={'app' + (maxed ? ' maxed' : '')} style={appStyle}>
      <div className="aurora">
        <span className="a1" />
        <span className="a2" />
        <span className="a3" />
      </div>
      <div className="vignette" />

      <TitleBar
        tab={tab}
        onTab={setTab}
        live={payload}
        demo={demo}
        onDemo={(on) => patch({ demo: on })}
        onHelp={() => {
          setGreet(false);
          setTour(true);
        }}
      />

      <div className="content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            className="page"
            initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === 'live' && (
              <LiveView
                live={payload}
                demo={demo}
                boot={boot}
                accent={theme === 'cover'}
                onDemo={(on) => patch({ demo: on })}
                onOpenPlays={() => setTab('plays')}
                onTab={setTab}
              />
            )}

            {tab === 'plays' &&
              (boot ? (
                <PlaysView boot={boot} fresh={fresh} onScan={rescan} />
              ) : (
                <div className="empty">Читаю данные…</div>
              ))}

            {tab === 'plan' &&
              (boot ? (
                <PlanView boot={boot} onOpenMaps={() => setTab('maps')} />
              ) : (
                <div className="empty">Читаю данные…</div>
              ))}

            {tab === 'dash' &&
              (boot ? (
                <Dashboard boot={boot} live={live} onRefresh={refreshApi} onTab={setTab} />
              ) : (
                <div className="empty">Читаю данные…</div>
              ))}

            {tab === 'maps' &&
              (boot ? <MapFinder boot={boot} onScan={rescan} /> : <div className="empty">Читаю данные…</div>)}

            {tab === 'profile' &&
              (boot ? <ProfileView boot={boot} onScan={rescan} /> : <div className="empty">Читаю данные…</div>)}

            {tab === 'settings' &&
              (boot ? (
                <SettingsView boot={boot} onPatch={patch} onScan={rescan} onRefresh={refreshApi} />
              ) : (
                <div className="empty">Читаю данные…</div>
              ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {boot && !boot.settings.onboarded && <Onboarding boot={boot} onPatch={patch} onScan={rescan} />}

      <AnimatePresence>
        {boot && greet && minElapsed && boot.settings.onboarded && !tourOpen && (
          <Greeting boot={boot} onClose={closeGreet} />
        )}
      </AnimatePresence>

      <AnimatePresence>{tourOpen && boot && <Tutorial onTab={setTab} onClose={closeTour} />}</AnimatePresence>

      <AnimatePresence>
        {!(boot && minElapsed) && (
          <Splash
            error={bootError}
            onRetry={() => {
              setBootError(null);
              load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
