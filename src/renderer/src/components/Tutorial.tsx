import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Tab } from './TitleBar';
import { BrandMark } from './BrandMark';

interface Step {
  key: string;
  tab?: Tab;
  title: string;
  body: string;
  points: string[];
}

const STEPS: Step[] = [
  {
    key: 'intro',
    title: 'Это тренер, а не очередной таймер',
    body: 'osu! Coach смотрит, как ты играешь, и считает выводы по твоим же скорам. Никакого ИИ: всё, что видишь, выводится из цифр.',
    points: [
      'Читает базу osu! (osu!.db и scores.db) прямо у тебя на диске',
      'Живой режим работает через tosu — поставь его, если ещё нет',
      'Данные обновляются сами: закончил карту — цифры уже другие',
    ],
  },
  {
    key: 'live',
    tab: 'live',
    title: 'Лайв',
    body: 'Экран, который живёт во время карты: точность, комбо, pp, UR и где именно рушится ритм.',
    points: [
      'Полосы показывают хиты, сотки, 50-ки и промахи на текущем пле',
      'После карты сразу открывается результат с разбором',
      'Цвета подстраиваются под обложку, если тема стоит на «обложка»',
    ],
  },
  {
    key: 'plays',
    tab: 'plays',
    title: 'Разборы',
    body: 'Последние плеи с честным вердиктом: что вышло, что просело и что с этим делать.',
    points: [
      'Каждый плей сравнивается с твоим обычным уровнем, а не со стримером',
      'Советы считаются по слабым местам: промахи, точность, длина, AR, BPM',
      'Свежий плей появляется тут сразу, ещё до того как osu! успела записать базу',
    ],
  },
  {
    key: 'dash',
    tab: 'dash',
    title: 'Прогресс',
    body: 'Главный ответ на вопрос «я вообще расту?». Видно динамику, а не только сегодняшний день.',
    points: [
      'Кривая точности по дням и импульс: сейчас, было, прирост',
      'Ступени сложности: медиана точности по звёздам и линия цели',
      'Совет дня и разминка — что сыграть прямо сейчас',
    ],
  },
  {
    key: 'plan',
    tab: 'plan',
    title: 'План',
    body: 'Что тренировать и на каких картах. Два фронта: дожать чистоту и шагнуть выше комфорта.',
    points: [
      'У каждой карты видно, почему она тут',
      'Кнопка «в osu!» открывает карту в клиенте, если она уже скачана',
      'Превью трека можно послушать, не выходя из проги',
    ],
  },
  {
    key: 'maps',
    tab: 'maps',
    title: 'Карты',
    body: 'Подбор новых карт под твой вкус: мапперы, артисты, темп и длина из твоей же истории.',
    points: [
      '«обновить» и «другие» реально меняют выдачу',
      'Скачанные карты открываются в osu! одним кликом, без повторного скачивания',
      'Если что-то уже есть в папке osu!, прога это видит',
    ],
  },
  {
    key: 'profile',
    tab: 'profile',
    title: 'Профиль и Настройки',
    body: 'Факты о том, как ты играешь, и ручки под себя: тема, аккаунт, папка osu!, оверлей.',
    points: [
      'В профиле: комфортная сложность, потолок, любимые мапперы и время суток',
      'В настройках можно выбрать тему оформления и вставить ключи osu! API',
      'Ключи хранятся только на этом компьютере',
    ],
  },
];

export function Tutorial({ onTab, onClose }: { onTab: (tab: Tab) => void; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const go = (next: number) => setIndex(Math.max(0, Math.min(STEPS.length - 1, next)));

  return (
    <div className="tour-backdrop" onClick={onClose}>
      <motion.div
        className="tour"
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      >
        <div className="tour-head">
          <span className="tour-mark">
            <BrandMark size={22} />
          </span>
          <b>как этим пользоваться</b>
          <span className="tour-count">
            {index + 1} / {STEPS.length}
          </span>
          <button className="tour-x" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <motion.div
          key={step.key}
          className="tour-body"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <h3>{step.title}</h3>
          <p>{step.body}</p>
          <ul>
            {step.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </motion.div>

        <div className="tour-foot">
          <button className="btn ghost" onClick={() => go(index - 1)} disabled={index === 0}>
            назад
          </button>

          <div className="tour-dots">
            {STEPS.map((item, dotIndex) => (
              <button
                key={item.key}
                className={'tour-dot' + (dotIndex === index ? ' on' : '')}
                onClick={() => go(dotIndex)}
                aria-label={item.title}
              />
            ))}
          </div>

          {step.tab && (
            <button
              className="btn ghost"
              onClick={() => {
                onTab(step.tab!);
                onClose();
              }}
            >
              открыть раздел
            </button>
          )}

          {last ? (
            <button className="btn" onClick={onClose}>
              понял
            </button>
          ) : (
            <button className="btn" onClick={() => go(index + 1)}>
              дальше
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
