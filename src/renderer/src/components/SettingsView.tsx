import { useState } from 'react';
import type { Bootstrap, Settings } from '../types';
import { bridge } from '../hooks';
import { fmtInt } from '../utils';
import { THEMES } from '../theme';
import { IconDownload, IconExternal, IconRefresh } from './Icons';

interface Props {
  boot: Bootstrap;
  onPatch: (patch: Partial<Settings>) => Promise<void>;
  onScan: () => void;
  onRefresh: () => void;
}

const GOAL_LABEL: Record<Settings['goal'], string> = {
  accuracy: 'точность',
  pp: 'pp',
  consistency: 'стабильность',
  speed: 'скорость',
  fun: 'в кайф',
};

const STYLE_LABEL: Record<Settings['style'], string> = {
  jumps: 'джампы',
  streams: 'стримы',
  tech: 'техно',
  mixed: 'всё подряд',
  unknown: '—',
};

const MOD_LABEL: Record<Settings['modPref'], string> = {
  nm: 'без модов',
  hr: 'HR',
  dt: 'DT',
  hd: 'HD',
  other: 'другое',
  unknown: '—',
};

const TAP_LABEL: Record<Settings['tapping'], string> = {
  single: 'одним пальцем',
  alternate: 'чередую',
  two: 'двумя руками',
  depends: 'по-разному',
  unknown: '—',
};

const DEVICE_LABEL: Record<Settings['device'], string> = {
  mouse: 'мышь',
  tablet: 'планшет',
  touchpad: 'тачпад',
  unknown: '—',
};

export function SettingsView({ boot, onPatch, onScan, onRefresh }: Props) {
  const [user, setUser] = useState(boot.settings.user);
  const [port, setPort] = useState(String(boot.settings.tosuPort));
  const [osuDir, setOsuDir] = useState(boot.settings.osuDir);
  const [clientId, setClientId] = useState(boot.settings.apiClientId);
  const [clientSecret, setClientSecret] = useState('');

  const tosuOk = boot.live.tosu.connected || boot.tosu.connected;
  const apiOk = boot.api.status.configured && !boot.api.status.error;
  const scan = boot.scan;

  return (
    <div className="settings fade-in">
      <div className="card set-card">
        <div className="set-title">
          Живые данные
          <span className={'badge ' + (tosuOk ? 'ok' : 'warn')}>{tosuOk ? 'на связи' : 'нет связи'}</span>
        </div>
        <p className="set-desc">
          tosu читает состояние osu! и отдаёт его сюда. Запусти tosu, потом osu!. Если osu! запущен от админа — tosu
          тоже от админа.
        </p>

        <div className="field">
          <label>порт</label>
          <input
            className="input"
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
            onBlur={() => {
              const value = Number(port) || 24050;
              if (value !== boot.settings.tosuPort) onPatch({ tosuPort: value });
            }}
          />
        </div>

        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" onClick={() => bridge.openExternal('https://github.com/tosuapp/tosu/releases')}>
            <IconDownload /> скачать tosu
          </button>
          <button className="btn ghost" onClick={() => bridge.openExternal('https://tosu.app')}>
            <IconExternal /> документация
          </button>
        </div>
      </div>

      <div className="card set-card">
        <div className="set-title">
          Демо-режим
          <span className={'badge ' + (boot.settings.demo ? 'warn' : '')}>
            {boot.settings.demo ? 'включён' : 'выключен'}
          </span>
        </div>
        <p className="set-desc">
          Показывает интерфейс без игры. Удобно, чтобы посмотреть, что получится, или показать друзьям.
        </p>
        <div className="switch-row">
          <p>
            <b>Демо</b>
            Синтетическая игра, ничего не отправляется
          </p>
          <button
            className={'switch ' + (boot.settings.demo ? 'on' : '')}
            onClick={() => onPatch({ demo: !boot.settings.demo })}
            aria-label="Демо-режим"
          />
        </div>
      </div>

      <div className="card set-card">
        <div className="set-title">
          Аккаунт osu!
          <span className={'badge ' + (apiOk ? 'ok' : 'warn')}>{apiOk ? 'подключён' : 'нет данных'}</span>
        </div>
        <p className="set-desc">
          Ник нужен, чтобы тянуть профиль, топ-плеи и статистику. Ключи можно вставить здесь или положить в <b>.env</b>{' '}
          рядом с прогой. Без ключей всё равно работают лайв, кривая навыка и подбор карт — только по локальным данным.
        </p>

        <div className="field">
          <label>ник</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={user}
              onChange={(e) => setUser(e.target.value.trim())}
            />
            <button
              className="btn"
              onClick={() => {
                if (user && user !== boot.settings.user) onPatch({ user });
                else onRefresh();
              }}
            >
              сохранить
            </button>
          </div>
        </div>

        <div className="field">
          <label>client id</label>
          <input
            className="input"
            value={clientId}
            placeholder={boot.api.status.configured ? 'ключи уже заданы' : 'число из osu! OAuth'}
            onChange={(event) => setClientId(event.target.value.trim())}
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label>client secret</label>
          <input
            className="input"
            type="password"
            value={clientSecret}
            placeholder={
              boot.api.status.configured ? '•••••••• — оставь пустым, чтобы не менять' : 'секрет из osu! OAuth'
            }
            onChange={(event) => setClientSecret(event.target.value.trim())}
            spellCheck={false}
            autoComplete="off"
          />
          <span className="field-hint">
            хранятся только на этом компьютере, в settings.json. Наружу уходят лишь запросы к osu! API
          </span>
        </div>

        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button
            className="btn"
            onClick={async () => {
              const patch: Partial<Settings> = {};
              if (clientId.trim() && clientId.trim() !== boot.settings.apiClientId) patch.apiClientId = clientId.trim();
              if (clientSecret.trim()) patch.apiClientSecret = clientSecret.trim();
              if (Object.keys(patch).length) await onPatch(patch);
              setClientSecret('');
              onRefresh();
            }}
          >
            сохранить ключи
          </button>
          <button
            className="btn ghost"
            onClick={() => bridge.openExternal('https://osu.ppy.sh/home/account/edit#oauth')}
          >
            <IconExternal /> где взять ключи
          </button>
        </div>

        <div>
          <div className="kv">
            <span>статус</span>
            <b>{boot.api.status.error ? boot.api.status.error : apiOk ? 'ок' : 'не настроено'}</b>
          </div>
          <div className="kv">
            <span>последнее обновление</span>
            <b>
              {boot.api.status.fetchedAt
                ? new Date(boot.api.status.fetchedAt).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </b>
          </div>
          <div className="kv">
            <span>топ-плеев</span>
            <b>{fmtInt(boot.api.best.length)}</b>
          </div>
        </div>

        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn ghost" onClick={onRefresh}>
            <IconRefresh /> обновить API
          </button>
        </div>
      </div>

      <div className="card set-card">
        <div className="set-title">
          Локальные данные
          <span className={'badge ' + (scan?.ok ? 'ok' : 'warn')}>{scan?.ok ? 'прочитано' : 'ошибка'}</span>
        </div>
        <p className="set-desc">
          Карты и все локальные скоры берутся прямо из папки osu!, без интернета. Это база для кривой навыка.
        </p>

        <div>
          <div className="kv">
            <span>карт в базе</span>
            <b>{fmtInt(scan?.mapsTotal)}</b>
          </div>
          <div className="kv">
            <span>сыграно скоров</span>
            <b>{fmtInt(scan?.playsTotal)}</b>
          </div>
          <div className="kv">
            <span>уникальных карт</span>
            <b>{fmtInt(scan?.uniqueMaps)}</b>
          </div>
        </div>

        <div className="field">
          <label>папка osu!</label>
          <input
            className="input"
            value={osuDir}
            placeholder={boot.paths.osuDir}
            onChange={(event) => setOsuDir(event.target.value)}
            onBlur={async () => {
              if (osuDir.trim() !== boot.settings.osuDir) {
                await onPatch({ osuDir: osuDir.trim() });
                onScan();
              }
            }}
          />
          <span className="field-hint">
            пусто = автоопределение. Меняй, только если osu! установлен в нестандартное место
          </span>
        </div>
        <div className="field">
          <label>данные проги</label>
          <div className="path">{boot.paths.dataDir}</div>
        </div>

        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" onClick={onScan}>
            <IconRefresh /> пересканировать
          </button>
        </div>
        {scan?.error && <p className="note">Ошибка: {scan.error}</p>}
      </div>

      <div className="card set-card">
        <div className="set-title">
          Оформление
          <span className="badge">{THEMES.find((t) => t.key === boot.settings.theme)?.label ?? 'обложка'}</span>
        </div>
        <p className="set-desc">
          Акцентный цвет интерфейса. <b>Обложка</b> подстраивается под текущую карту в лайве, остальные держат выбранную
          пару цветов постоянно. Тема применяется мгновенно, по всей проге.
        </p>
        <div className="theme-grid">
          {THEMES.map((item) => {
            const on = boot.settings.theme === item.key;
            return (
              <button
                key={item.key}
                className={'theme-pick' + (on ? ' on' : '')}
                onClick={() => onPatch({ theme: item.key })}
                title={item.hint}
              >
                <span
                  className="theme-swatch"
                  style={{ background: `linear-gradient(135deg, ${item.pink}, ${item.violet})` }}
                />
                <b>{item.label}</b>
                <span className="theme-hint">{item.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card set-card">
        <div className="set-title">
          Оверлей поверх osu!
          <span className={'badge ' + (boot.settings.overlay ? 'ok' : '')}>
            {boot.settings.overlay ? 'включён' : 'выключен'}
          </span>
        </div>
        <p className="set-desc">
          Маленькая панель с точностью, комбо, pp и прогрессом поверх игры. Один монитор — не проблема: панель висит в
          углу того же экрана. Важен только режим osu!: <b>borderless</b> или оконный. Эксклюзивный фуллскрин Windows
          перекрывает всё, и обойти это без вмешательства в игру нельзя.
        </p>

        <div className="switch-row">
          <p>
            <b>Показывать оверлей</b>
            Отдельное прозрачное окно, клики проходят сквозь него
          </p>
          <button
            className={'switch ' + (boot.settings.overlay ? 'on' : '')}
            onClick={() => onPatch({ overlay: !boot.settings.overlay })}
            aria-label="Оверлей"
          />
        </div>

        <div className="field">
          <label>положение</label>
          <div className="choice-row">
            {(
              [
                ['tl', 'слева сверху'],
                ['tr', 'справа сверху'],
                ['bl', 'слева снизу'],
                ['br', 'справа снизу'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={'choice' + (boot.settings.overlayPos === value ? ' on' : '')}
                onClick={() => onPatch({ overlayPos: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="borderless-help">
          <b>как включить borderless в osu!</b>
          <ol>
            <li>Options → Graphics → Display mode</li>
            <li>выбери Borderless</li>
            <li>разрешение поставь как у монитора</li>
          </ol>
          <p>После этого панель будет видна поверх игры. Эксклюзивный фуллскрин она не пробьёт.</p>
        </div>
      </div>

      <div className="card set-card">
        <div className="set-title">Настройка под себя</div>
        <p className="set-desc">
          Эти ответы задаются один раз при первом запуске и влияют на план, подсказки и подбор карт. Меняются вручную,
          если что-то поменялось в жизни.
        </p>
        <div className="kv">
          <span>устройство</span>
          <b>{DEVICE_LABEL[boot.settings.device]}</b>
        </div>
        <div className="kv">
          <span>техника</span>
          <b>{TAP_LABEL[boot.settings.tapping]}</b>
        </div>
        <div className="kv">
          <span>цель</span>
          <b>{GOAL_LABEL[boot.settings.goal]}</b>
        </div>
        <div className="kv">
          <span>стиль</span>
          <b>{STYLE_LABEL[boot.settings.style]}</b>
        </div>
        <div className="kv">
          <span>моды</span>
          <b>{MOD_LABEL[boot.settings.modPref]}</b>
        </div>
        <div className="kv">
          <span>в день</span>
          <b>{boot.settings.dailyMinutes} мин</b>
        </div>
        {boot.settings.music && (
          <div className="kv">
            <span>музыка</span>
            <b>{boot.settings.music}</b>
          </div>
        )}
      </div>

      <div className="card set-card">
        <div className="set-title">О проге</div>
        <p className="set-desc">
          osu! coach {boot.version}. Локальные данные читаются из osu!.db и scores.db, живые — из tosu, профиль — из
          osu! API v2. Ничего не пишет в игру и не отправляет на сервер, кроме запросов к официальному API.
        </p>
        <p className="note">
          Совет: играй в borderless, если хочешь держать окно рядом. Эксклюзивный фуллскрин перекрывает всё.
        </p>
      </div>
    </div>
  );
}
