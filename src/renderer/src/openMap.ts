/**
 * «в osu!» — one entry point for every screen.
 *
 * osu! stable on current builds does not react to osu://b/<id> links: the app can
 * verify that through tosu and, when nothing happened, brings the game window
 * forward and puts the map name into the clipboard. No silent "success" is
 * reported, and a second click while the first one is still running is ignored.
 */
export interface OpenMapNotice {
  tone: 'ok' | 'warn';
  text: string;
}

let inFlight: Promise<OpenMapNotice | null> | null = null;

export function openInOsu(map: { id: number; title: string }): Promise<OpenMapNotice | null> {
  if (inFlight) return inFlight;
  inFlight = run(map).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(map: { id: number; title: string }): Promise<OpenMapNotice | null> {
  const api = window.api;
  if (!api) return null;

  let result;
  try {
    result = await api.openMap({ id: map.id, title: map.title });
  } catch (err) {
    return { tone: 'warn', text: `не вышло: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (result.ok) return null;

  if (result.reason === 'not-running') {
    return {
      tone: 'warn',
      text: result.started
        ? 'osu! был закрыт — запустил игру. Ссылку stable не принимает, название карты в буфере: вставь в поиск (Ctrl+V).'
        : 'osu! закрыт, и запустить не вышло. Открой игру вручную.',
    };
  }

  if (result.reason === 'stable-ignored') {
    return {
      tone: 'warn',
      text: result.copied
        ? 'osu! впереди, но ссылку он проигнорировал. Название карты уже в буфере — вставь в поиск (Ctrl+V).'
        : 'osu! впереди, но ссылку он проигнорировал. Найди карту в song select вручную.',
    };
  }

  if (result.reason === 'no-tosu') {
    return {
      tone: 'warn',
      text: 'Ссылку отправил, но tosu не подключён — проверить не могу. Включи tosu, если карта не открылась.',
    };
  }

  return { tone: 'warn', text: result.error ? `не вышло: ${result.error}` : 'не вышло открыть карту в osu!' };
}
