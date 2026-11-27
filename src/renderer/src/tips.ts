import type { Bootstrap, ScanResult } from './types';
import type { Tab } from './components/TitleBar';
import { fmtNum, fmtTime, plural } from './utils';

/**
 * Advice the app can actually stand behind.
 *
 * Every tip is derived from the local scores with plain arithmetic: no model,
 * no guessing. When the database is not readable yet, a short list of general
 * osu! advice is used instead, and those tips never pretend to know the player.
 */
export interface Tip {
  id: string;
  tone: 'good' | 'warn' | 'idea';
  title: string;
  body: string;
  action?: { label: string; tab: Tab };
}

/** Same tip for the whole day, a different one tomorrow. */
export function dayKey(at = Date.now()): string {
  return String(Math.floor(at / 86_400_000));
}

export function stableHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Short lines for the first seconds while the database is being read. */
export const loadingTips: string[] = [
  'Комбо — следствие ритма, а не наоборот.',
  'Разминка: две карты ниже комфорта, одна на комфорте.',
  'Промах стоит дороже сотки: чистота важнее скорости.',
  'Три подхода к одной карте полезнее трёх новых.',
  'Усталость видно по цифрам, а не по ощущениям.',
  'Слушай трек, а не счётчик комбо.',
  'Длинная карта в конце сессии учит выносливости.',
];

const generalTips: Tip[] = [
  {
    id: 'general-combo',
    tone: 'idea',
    title: 'Комбо — не цель',
    body: 'Смотри на круги и на ритм. Комбо само догонит: стоит начать следить за счётчиком, и рука начинает спешить.',
  },
  {
    id: 'general-sound',
    tone: 'idea',
    title: 'Ритм слышно, а не видно',
    body: 'В наушниках 300 ставятся по кликам, а не по пикселям. Если ловишь себя на «поздно» — слушай трек, а не круги.',
  },
  {
    id: 'general-warmup',
    tone: 'idea',
    title: 'Разминка не для галочки',
    body: 'Две карты ниже комфорта и одна на комфорте. Руки просыпаются минуте на пятой, рекорды до этого — лотерея.',
  },
  {
    id: 'general-sleep',
    tone: 'idea',
    title: 'Усталость видно по цифрам',
    body: 'Если три плея подряд ниже обычного, дело не в карте. Закрой osu! на десять минут: точность вернётся быстрее, чем от ещё одной попытки.',
  },
  {
    id: 'general-repeat',
    tone: 'idea',
    title: 'Одна карта, три подхода',
    body: 'Три прохода по одной карте дают больше, чем три новые за тот же час. Новое тренирует чтение, повторное — чистоту.',
  },
  {
    id: 'general-hand',
    tone: 'idea',
    title: 'Хват слишком крепкий',
    body: 'Локоть на столе, запястье свободно. Если предплечье устало раньше, чем прошла сессия, ты держишь мышь сильнее, чем нужно.',
  },
];

function fromScan(scan: ScanResult): Tip[] {
  const tips: Tip[] = [];
  const s = scan.skills;
  const comfort = scan.comfortStar;
  const hard = scan.hardStar;

  if (s.missRate >= 1.2) {
    tips.push({
      id: 'miss-rate',
      tone: 'warn',
      title: 'Промахи дороже соток',
      body: `${fmtNum(s.missRate, 1)}% нот уходят в мисс. На разминке играй на 0.9x и не гонись за комбо: три чистых прохода дают больше, чем один рекорд с промахом.`,
    });
  }

  if (s.gap >= 4) {
    tips.push({
      id: 'gap',
      tone: 'warn',
      title: 'Точность скачет',
      body: `Между лучшим плеем и медианой ${fmtNum(s.gap, 1)} п.п. Это не потолок, это нервы. Сыграй одну карту три раза подряд и держи ровно, а не на рекорд.`,
      action: { label: 'к разборам', tab: 'plays' },
    });
  }

  if (comfort != null && hard != null && hard - comfort >= 0.6) {
    tips.push({
      id: 'bridge',
      tone: 'idea',
      title: 'Между комфортом и потолком пусто',
      body: `Комфорт заканчивается на ${fmtNum(comfort, 1)}★, а дальше сразу ${fmtNum(hard, 1)}★. Возьми две-три карты ровно в середине, без прыжка через ползвезды.`,
      action: { label: 'подобрать карты', tab: 'maps' },
    });
  }

  const drain = scan.segments?.drain;
  if (drain && drain.delta != null && drain.delta <= -1.5) {
    tips.push({
      id: 'drain',
      tone: 'warn',
      title: 'Длинные карты проседают',
      body: `На картах длиннее ${fmtTime(drain.cut * 1000)} точность ниже на ${fmtNum(Math.abs(drain.delta), 1)} п.п. Одна длинная в конце сессии полезнее пяти коротких.`,
    });
  }

  const ar = scan.segments?.ar;
  if (ar && ar.delta != null && ar.delta <= -1.5) {
    tips.push({
      id: 'ar',
      tone: 'warn',
      title: 'Высокий AR не читается',
      body: `Выше AR ${fmtNum(ar.cut, 1)} теряешь ${fmtNum(Math.abs(ar.delta), 1)} п.п. Добавь в разминку одну карту на AR ${fmtNum(ar.cut + 0.5, 1)} — глазам нужен запас, а не рывок.`,
    });
  }

  const bpm = scan.segments?.bpm;
  if (bpm && bpm.delta != null && bpm.delta <= -1.5) {
    tips.push({
      id: 'bpm',
      tone: 'warn',
      title: 'На скорости сыпется',
      body: `После ${Math.round(bpm.cut)} BPM точность падает на ${fmtNum(Math.abs(bpm.delta), 1)} п.п. Потренируй ${Math.round(bpm.cut) - 10} BPM с запасом: скорость приходит от расслабленной руки, а не от силы.`,
    });
  }

  if (s.zeroMiss < 35 && scan.playsTotal > 30) {
    tips.push({
      id: 'zero-miss',
      tone: 'idea',
      title: 'Комбо рвётся',
      body: `Без единого промаха проходит ${fmtNum(s.zeroMiss, 0)}% плеев. Начни сессию с трёх карт, где можешь пройти чисто, и только потом лезь выше.`,
    });
  }

  if (scan.playsPerMap >= 3) {
    tips.push({
      id: 'habit',
      tone: 'good',
      title: 'Ты не прыгаешь по картам',
      body: `В среднем ${Math.round(scan.playsPerMap)} ${plural(Math.round(scan.playsPerMap), 'плей', 'плея', 'плеев')} на карту. Для чтения это хорошо. Раз в сессию всё равно бери карту, которую видишь впервые.`,
      action: { label: 'найти новое', tab: 'maps' },
    });
  }

  if (scan.bestPlay) {
    const best = scan.bestPlay;
    tips.push({
      id: 'best',
      tone: 'good',
      title: 'Лучший плей',
      body: `${best.title} [${best.diff}] — ${fmtNum(best.acc, 1)}%. Загляни в разбор: там видно, на чём именно держится точность.`,
      action: { label: 'открыть разбор', tab: 'plays' },
    });
  }

  if (scan.avgAcc < 96) {
    const target = Math.min(96, Math.ceil(scan.avgAcc + 1));
    tips.push({
      id: 'target',
      tone: 'idea',
      title: 'Цель на сегодня',
      body: `Средняя точность ${fmtNum(scan.avgAcc, 1)}%. Держи на комфорте ${target}% и не трогай сложность, пока цифра не станет скучной.`,
    });
  }

  return tips;
}

/** Tips for today, in a stable order that changes once a day. */
export function buildTips(boot: Bootstrap | null, at = Date.now()): Tip[] {
  const scan = boot?.scan;
  const base = scan?.ok ? fromScan(scan) : [];
  const key = dayKey(at);
  const ordered = (list: Tip[]) => [...list].sort((a, b) => stableHash(a.id + key) - stableHash(b.id + key));
  // Personal tips first, general ones after them: the player should not get
  // generic advice while the database already knows something specific.
  return base.length ? [...ordered(base), ...ordered(generalTips)] : ordered(generalTips);
}
