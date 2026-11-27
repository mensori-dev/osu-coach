import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Annoy, Bootstrap, Device, Goal, ModPref, PlayStyle, Settings, Tapping } from '../types';
import { fmtInt, fmtNum } from '../utils';
import { IconArrowRight, IconCheck, IconRefresh, IconSpark } from './Icons';

interface Props {
  boot: Bootstrap;
  onPatch: (patch: Partial<Settings>) => void;
  onScan: () => void;
}

const QUESTIONS = 9;

const GOALS: { id: Goal; title: string; hint: string }[] = [
  { id: 'accuracy', title: 'точность', hint: 'меньше соток и миссов, выше медиана' },
  { id: 'pp', title: 'pp', hint: 'расти в рейтинге' },
  { id: 'consistency', title: 'стабильность', hint: 'не разваливаться на середине' },
  { id: 'speed', title: 'скорость', hint: 'держать высокий BPM' },
  { id: 'fun', title: 'в кайф', hint: 'без цифры, просто играть' },
];

const STYLES: { id: PlayStyle; title: string; hint: string }[] = [
  { id: 'jumps', title: 'джампы', hint: 'прыжки и широкие движения' },
  { id: 'streams', title: 'стримы', hint: 'долгие потоки нот' },
  { id: 'tech', title: 'техно', hint: 'ритм, углы, нестандартные паттерны' },
  { id: 'mixed', title: 'всё подряд', hint: 'без одного любимого стиля' },
];

const MODS: { id: ModPref; title: string; hint: string }[] = [
  { id: 'nm', title: 'без модов', hint: 'чистая карта, как есть' },
  { id: 'hr', title: 'HR', hint: 'жёстче читать и попадать' },
  { id: 'dt', title: 'DT', hint: 'быстрее и веселее' },
  { id: 'hd', title: 'HD', hint: 'круги исчезают, память решает' },
  { id: 'other', title: 'другое', hint: 'EZ, FL, миксы' },
];

const ANNOY: { id: Annoy; title: string; hint: string }[] = [
  { id: 'misses', title: 'миссы', hint: 'вроде попадаю, но нет' },
  { id: 'speed', title: 'скорость', hint: 'руки не успевают' },
  { id: 'reading', title: 'чтение', hint: 'AR высокий, глаза болят' },
  { id: 'maps', title: 'кривые карты', hint: 'паттерны не заходят' },
  { id: 'nothing', title: 'ничего', hint: 'всё устраивает' },
];

const MUSIC_CHIPS = ['метал / рок', 'электроника', 'поп и русское', 'аниме / вокал', 'рэп', 'всё подряд'];

function Choice({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  title: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button className={'onboard-option' + (active ? ' on' : '')} onClick={onClick}>
      <b>{title}</b>
      {hint && <span>{hint}</span>}
      {active && (
        <i className="onboard-check">
          <IconCheck size={13} />
        </i>
      )}
    </button>
  );
}

export function Onboarding({ boot, onPatch, onScan }: Props) {
  const [step, setStep] = useState(0);
  const [user, setUser] = useState(boot.settings.user || '');
  const [device, setDevice] = useState<Device>(boot.settings.device);
  const [tapping, setTapping] = useState<Tapping>(boot.settings.tapping);
  const [goal, setGoal] = useState<Goal>(boot.settings.goal);
  const [minutes, setMinutes] = useState(boot.settings.dailyMinutes);
  const [style, setStyle] = useState<PlayStyle>(boot.settings.style);
  const [modPref, setModPref] = useState<ModPref>(boot.settings.modPref);
  const [music, setMusic] = useState(boot.settings.music);
  const [annoy, setAnnoy] = useState<Annoy>(boot.settings.annoy);

  const scan = boot.scan;
  const detected = Boolean(scan?.ok);
  const final = step >= QUESTIONS;

  const finish = () =>
    onPatch({
      user: user.trim(),
      device,
      tapping,
      goal,
      dailyMinutes: minutes,
      style,
      modPref,
      music: music.trim(),
      annoy,
      onboarded: true,
    });

  const next = () => {
    if (step < QUESTIONS) setStep(step + 1);
    else finish();
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  const skip = () => {
    if (step < QUESTIONS) setStep(step + 1);
    else finish();
  };

  const progress = ((step + 1) / (QUESTIONS + 1)) * 100;

  return (
    <div className="onboarding">
      <div className="onboard-screen">
        <header className="onboard-head">
          <div className="onboard-brand">
            <span className="brand-mark" />
            <b>
              osu!<em>coach</em>
            </b>
          </div>
          <div className="onboard-progress">
            <i style={{ width: `${progress}%` }} />
          </div>
          <span className="onboard-count">{final ? 'готово' : `${step + 1} / ${QUESTIONS}`}</span>
        </header>

        <div className="onboard-stage">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="onboard-question"
            >
              {step === 0 && (
                <>
                  <span className="onboard-tag">знакомство</span>
                  <h1>как тебя зовут в osu!?</h1>
                  <p className="onboard-sub">
                    Ник нужен, чтобы подтянуть профиль и не путать тебя с другими. Можно пропустить и вписать потом.
                  </p>
                  <input
                    className="onboard-input"
                    value={user}
                    placeholder="например, mens0ri"
                    autoFocus
                    onChange={(event) => setUser(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') next();
                    }}
                  />
                </>
              )}

              {step === 1 && (
                <>
                  <span className="onboard-tag">устройство</span>
                  <h1>на чём играешь?</h1>
                  <p className="onboard-sub">От этого зависит, что советовать: угол атаки, скорость и стиль карт.</p>
                  <div className="onboard-options">
                    <Choice
                      active={device === 'mouse'}
                      title="мышь"
                      hint="курсор мышью, клики клавишами"
                      onClick={() => setDevice('mouse')}
                    />
                    <Choice
                      active={device === 'tablet'}
                      title="планшет"
                      hint="перо по планшету, клики клавишами"
                      onClick={() => setDevice('tablet')}
                    />
                    <Choice
                      active={device === 'touchpad'}
                      title="тачпад"
                      hint="ноутбучный тачпад"
                      onClick={() => setDevice('touchpad')}
                    />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <span className="onboard-tag">техника</span>
                  <h1>как жмёшь по кругам?</h1>
                  <p className="onboard-sub">
                    Это про руки, не про карту. Нужно, чтобы план не советовал чужую технику.
                  </p>
                  <div className="onboard-options">
                    <Choice
                      active={tapping === 'single'}
                      title="одним пальцем"
                      hint="одна клавиша почти всегда"
                      onClick={() => setTapping('single')}
                    />
                    <Choice
                      active={tapping === 'alternate'}
                      title="чередую"
                      hint="две клавиши по очереди"
                      onClick={() => setTapping('alternate')}
                    />
                    <Choice
                      active={tapping === 'two'}
                      title="двумя руками"
                      hint="каждая рука на своей клавише"
                      onClick={() => setTapping('two')}
                    />
                    <Choice
                      active={tapping === 'depends'}
                      title="зависит от карты"
                      hint="на стримах чередую, на джампах одним"
                      onClick={() => setTapping('depends')}
                    />
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <span className="onboard-tag">цель</span>
                  <h1>что реально хочешь качать?</h1>
                  <p className="onboard-sub">Не «правильный ответ», а твой. Под это подстроятся акценты в разборе.</p>
                  <div className="onboard-options">
                    {GOALS.map((item) => (
                      <Choice
                        key={item.id}
                        active={goal === item.id}
                        title={item.title}
                        hint={item.hint}
                        onClick={() => setGoal(item.id)}
                      />
                    ))}
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <span className="onboard-tag">режим</span>
                  <h1>сколько минут в день готов играть осознанно?</h1>
                  <p className="onboard-sub">Не «сколько получится», а сколько реально выделишь без спешки.</p>
                  <div className="onboard-options onboard-options-wide">
                    {[30, 60, 90, 120].map((value) => (
                      <Choice
                        key={value}
                        active={minutes === value}
                        title={`${value} минут`}
                        hint={
                          value === 30
                            ? 'короткая сессия'
                            : value === 60
                              ? 'час с разминкой'
                              : value === 90
                                ? 'полтора часа'
                                : 'два часа и больше'
                        }
                        onClick={() => setMinutes(value)}
                      />
                    ))}
                  </div>
                </>
              )}

              {step === 5 && (
                <>
                  <span className="onboard-tag">стиль</span>
                  <h1>что чаще играешь?</h1>
                  <p className="onboard-sub">Выбери то, что заходит чаще всего. Если всего понемногу, так и скажи.</p>
                  <div className="onboard-options">
                    {STYLES.map((item) => (
                      <Choice
                        key={item.id}
                        active={style === item.id}
                        title={item.title}
                        hint={item.hint}
                        onClick={() => setStyle(item.id)}
                      />
                    ))}
                  </div>
                </>
              )}

              {step === 6 && (
                <>
                  <span className="onboard-tag">моды</span>
                  <h1>какие моды любишь?</h1>
                  <p className="onboard-sub">Один основной вариант. Если вообще без модов, тоже вариант.</p>
                  <div className="onboard-options">
                    {MODS.map((item) => (
                      <Choice
                        key={item.id}
                        active={modPref === item.id}
                        title={item.title}
                        hint={item.hint}
                        onClick={() => setModPref(item.id)}
                      />
                    ))}
                  </div>
                </>
              )}

              {step === 7 && (
                <>
                  <span className="onboard-tag">музыка</span>
                  <h1>что слушаешь вне osu!?</h1>
                  <p className="onboard-sub">
                    Артисты, жанры, что угодно. По этому я буду искать карты, которые тебе зайдут, а не просто
                    «популярное».
                  </p>
                  <input
                    className="onboard-input"
                    value={music}
                    placeholder="например: Bring Me The Horizon, Drum and Bass, ПОШЛАЯ МОЛЛИ"
                    autoFocus
                    onChange={(event) => setMusic(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') next();
                    }}
                  />
                  <div className="onboard-chips">
                    {MUSIC_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        className={'onboard-chip' + (music.toLowerCase().includes(chip.toLowerCase()) ? ' on' : '')}
                        onClick={() =>
                          setMusic((value) => {
                            const parts = value
                              .split(',')
                              .map((part) => part.trim())
                              .filter(Boolean);
                            if (parts.some((part) => part.toLowerCase() === chip.toLowerCase())) {
                              return parts.filter((part) => part.toLowerCase() !== chip.toLowerCase()).join(', ');
                            }
                            return [...parts, chip].join(', ');
                          })
                        }
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === 8 && (
                <>
                  <span className="onboard-tag">боли</span>
                  <h1>что бесит в игре сильнее всего?</h1>
                  <p className="onboard-sub">Честно. Тогда разбор будет про твою боль, а не про абстрактные графики.</p>
                  <div className="onboard-options">
                    {ANNOY.map((item) => (
                      <Choice
                        key={item.id}
                        active={annoy === item.id}
                        title={item.title}
                        hint={item.hint}
                        onClick={() => setAnnoy(item.id)}
                      />
                    ))}
                  </div>
                </>
              )}

              {final && (
                <>
                  <span className="onboard-tag">проверка</span>
                  <h1>теперь посмотрим на твои плеи</h1>
                  <p className="onboard-sub">
                    Читаю <b>osu!.db</b> и <b>scores.db</b> из папки osu!. Без интернета и без записи в игру.
                  </p>

                  <div className="onboard-scan">
                    <div>
                      <span>папка osu!</span>
                      <b>{boot.paths.osuDir}</b>
                    </div>
                    <button className="btn" onClick={onScan}>
                      <IconRefresh /> {detected ? 'пересканировать' : 'найти мои плеи'}
                    </button>
                  </div>

                  {detected ? (
                    <div className="onboard-found">
                      <div>
                        <span>плеев</span>
                        <b>{fmtInt(scan?.playsTotal)}</b>
                      </div>
                      <div>
                        <span>карт</span>
                        <b>{fmtInt(scan?.mapsTotal)}</b>
                      </div>
                      <div>
                        <span>комфорт</span>
                        <b>{fmtNum(scan?.comfortStar, 1)}★</b>
                      </div>
                      <div>
                        <span>точность</span>
                        <b>{fmtNum(scan?.avgAcc, 1)}%</b>
                      </div>
                    </div>
                  ) : (
                    <p className="note">
                      Данные не найдены. Если osu! стоит в другом месте, укажи путь в настройках после запуска.
                    </p>
                  )}

                  <div className="onboard-summary">
                    <IconSpark size={14} />
                    <p>
                      {user ? `${user}, ` : ''}
                      {GOALS.find((item) => item.id === goal)?.hint}. План: {minutes} минут в день, упор на{' '}
                      {GOALS.find((item) => item.id === goal)?.title}.{music ? ` В наушниках: ${music}.` : ''}
                    </p>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="onboard-foot">
          <button className="btn ghost" onClick={skip}>
            {final ? 'пропустить проверку' : 'пропустить вопрос'}
          </button>
          <div className="onboard-nav">
            {step > 0 && (
              <button className="btn ghost" onClick={back}>
                назад
              </button>
            )}
            <button className="btn primary" onClick={next}>
              {final ? 'поехали' : 'дальше'} <IconArrowRight size={15} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
