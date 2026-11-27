import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { IconPause, IconPlay } from './Icons';

let audio: HTMLAudioElement | null = null;
let active = 0;
const subs = new Set<() => void>();

function notify() {
  for (const fn of subs) fn();
}

function element() {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'none';
    audio.volume = 0.85;
    audio.addEventListener('ended', () => {
      active = 0;
      notify();
    });
    audio.addEventListener('error', () => {
      active = 0;
      notify();
    });
  }
  return audio;
}

export function stopPreview() {
  if (audio) audio.pause();
  active = 0;
  notify();
}

interface Props {
  setId: number;
  className?: string;
  size?: number;
  label?: string;
}

/**
 * 30-second osu! preview (b.ppy.sh) for a beatmapset.
 * One shared audio element, so starting another preview stops the previous one.
 */
export function PreviewButton({ setId, className = '', size = 12, label }: Props) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const sync = () => {
      const player = audio;
      setPlaying(active === setId && player !== null && !player.paused);
    };
    subs.add(sync);
    sync();
    return () => {
      subs.delete(sync);
    };
  }, [setId]);

  const toggle = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!setId) return;

    const player = element();
    if (active === setId && !player.paused) {
      player.pause();
      active = 0;
      notify();
      return;
    }

    player.src = `https://b.ppy.sh/preview/${setId}.mp3`;
    player.currentTime = 0;
    setFailed(false);
    active = setId;
    notify();

    player
      .play()
      .then(notify)
      .catch(() => {
        setFailed(true);
        active = 0;
        notify();
      });
  };

  return (
    <button
      type="button"
      className={`preview-btn${playing ? ' on' : ''}${failed ? ' err' : ''} ${className}`.trim()}
      onClick={toggle}
      title={failed ? 'Превью не загрузилось — нужен интернет' : playing ? 'Остановить' : 'Послушать трек'}
      aria-label={playing ? 'Остановить превью' : 'Послушать трек'}
    >
      {playing ? <IconPause size={size} /> : <IconPlay size={size} />}
      {label && <span>{playing ? 'стоп' : label}</span>}
    </button>
  );
}
