import { useStore } from '../model/store';
import { useT } from '../ui/i18n';
import { ACCENT_PRESETS } from '../ui/theme';
import { Button, ColorPicker, Dialog, Segmented, Switch } from '../ui/components';
import type { Corner, Orientation } from '../model/types';

const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];
const dotPos: Record<Corner, React.CSSProperties> = {
  tl: { top: 8, left: 8 },
  tr: { top: 8, right: 8 },
  bl: { bottom: 8, left: 8 },
  br: { bottom: 8, right: 8 },
};

export function SettingsDialog() {
  const t = useT();
  const open = useStore((s) => s.settingsOpen);
  const s = useStore((st) => st.settings);
  const set = useStore.getState().setSettings;
  if (!open) return null;
  const close = () => useStore.getState().set({ settingsOpen: false });
  return (
    <Dialog
      title={t('settings')}
      icon="settings"
      wide
      onClose={close}
      actions={
        <>
          <span className="left body-s muted">
            {t('appTitle')} · {t('version')} {__APP_VERSION__}
          </span>
          <Button variant="filled" onClick={close}>
            {t('close')}
          </Button>
        </>
      }
    >
      <div className="section-label">{t('theme')}</div>
      <Segmented
        value={s.theme}
        onChange={(v) => set({ theme: v })}
        options={[
          { value: 'light', label: t('light'), icon: 'light_mode' },
          { value: 'dark', label: t('dark'), icon: 'dark_mode' },
          { value: 'system', label: t('system'), icon: 'contrast' },
        ]}
      />

      <div className="section-label">{t('design')}</div>
      <div className="design-preview">
        {(['md1', 'md3', 'w95'] as const).map((d) => (
          <button key={d} className={`design-card state ${s.design === d ? 'on' : ''}`} onClick={() => set({ design: d })}>
            {d === 'w95' ? (
              <div className="mini" style={{ background: '#c0c0c0', borderRadius: 0, border: '1px solid #000' }}>
                <div className="bar" style={{ background: s.accent }} />
                <div
                  className="btn-mini"
                  style={{ background: '#c0c0c0', boxShadow: 'inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080' }}
                />
              </div>
            ) : (
              <div className="mini">
                <div className="bar" style={{ background: d === 'md1' ? s.accent : 'var(--md-surface-container-high)' }} />
                <div
                  className="btn-mini"
                  style={{
                    background: s.accent,
                    borderRadius: d === 'md1' ? 2 : 7,
                    boxShadow: d === 'md1' ? '0 2px 3px rgb(0 0 0 / .3)' : 'none',
                  }}
                />
              </div>
            )}
            <div className="title-s">{t(d)}</div>
            <div className="body-s muted">{d === 'md1' ? '2014 · Paper & ink' : d === 'md3' ? '2021+ · Material You' : '1995 · Windows 95 UI Kit'}</div>
          </button>
        ))}
      </div>

      <div className="section-label">{t('accent')}</div>
      <ColorPicker value={s.accent} colors={ACCENT_PRESETS} onChange={(c) => c && set({ accent: c })} />

      <div className="section-label">{t('language')}</div>
      <Segmented
        value={s.lang}
        onChange={(v) => set({ lang: v })}
        options={[
          { value: 'ru', label: 'Русский' },
          { value: 'en', label: 'English' },
        ]}
      />

      <div className="section-label">{t('cornerPos')}</div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div className="corner-pick">
          {CORNERS.map((c) => (
            <button key={c} className={s.corner === c ? 'on' : ''} onClick={() => set({ corner: c })} title={t(c)}>
              <span className="dot" style={dotPos[c]} />
            </button>
          ))}
        </div>
        <div className="body-m muted">{t(s.corner)}</div>
      </div>

      <div className="section-label">{t('orientation')}</div>
      <Segmented
        value={s.orientation}
        onChange={(v: Orientation) => set({ orientation: v })}
        options={[
          { value: 'tb', label: t('tb'), icon: 'south' },
          { value: 'rl', label: t('rl'), icon: 'west' },
          { value: 'bt', label: t('bt'), icon: 'north' },
          { value: 'lr', label: t('lr'), icon: 'east' },
        ]}
      />

      <Switch label={t('showLinkComments')} checked={s.showLinkComments} onChange={(v) => set({ showLinkComments: v })} />
    </Dialog>
  );
}
