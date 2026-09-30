import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { useT } from './i18n';
import { LINE_COLORS } from './theme';

export function Icon({ name, fill, className = '', style }: { name: string; fill?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`material-symbols-outlined ${fill ? 'icon-fill' : ''} ${className}`} style={style} aria-hidden>
      {name}
    </span>
  );
}

function spawnRipple(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2;
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.width = s.style.height = `${size}px`;
  s.style.left = `${e.clientX - r.left - size / 2}px`;
  s.style.top = `${e.clientY - r.top - size / 2}px`;
  el.appendChild(s);
  setTimeout(() => s.remove(), 600);
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'filled' | 'tonal' | 'outlined' | 'text';
  icon?: string;
  danger?: boolean;
};

export function Button({ variant = 'text', icon, danger, className = '', children, onPointerDown, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`btn state ${variant} ${danger ? 'danger' : ''} ${className}`}
      onPointerDown={(e) => {
        spawnRipple(e);
        onPointerDown?.(e);
      }}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

type IconBtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; small?: boolean; active?: boolean; fill?: boolean };

export function IconButton({ icon, small, active, fill, className = '', title, ...rest }: IconBtnProps) {
  return (
    <button
      type="button"
      className={`icon-btn state ${small ? 'small' : ''} ${active ? 'active' : ''} ${className}`}
      aria-label={title}
      {...tip(title)}
      onPointerDown={spawnRipple}
      {...rest}
    >
      <Icon name={icon} fill={fill || active} />
    </button>
  );
}

export function Fab({ icon, title, small, secondary, onClick }: { icon: string; title: string; small?: boolean; secondary?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`fab state ${small ? 'small' : ''} ${secondary ? 'secondary' : ''}`}
      aria-label={title}
      {...tip(title)}
      onPointerDown={spawnRipple}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

// ---------------- tooltip ----------------
const useTip = create<{ text: string | null; x: number; y: number }>(() => ({ text: null, x: 0, y: 0 }));

export function tip(text?: string) {
  if (!text) return {};
  return {
    onMouseEnter: (e: React.MouseEvent) => showTip(text, e.clientX, e.clientY),
    onMouseMove: (e: React.MouseEvent) => showTip(text, e.clientX, e.clientY),
    onMouseLeave: hideTip,
  };
}
export const showTip = (text: string, x: number, y: number) => useTip.setState({ text, x, y });
export const hideTip = () => useTip.setState({ text: null });

export function TooltipLayer() {
  const { text, x, y } = useTip();
  if (!text) return null;
  const left = Math.min(x + 12, window.innerWidth - 330);
  return (
    <div className="tooltip" style={{ left, top: y + 18 }}>
      {text}
    </div>
  );
}

// ---------------- fields ----------------
export function TextField({
  label,
  value,
  onChange,
  multiline,
  placeholder,
  type = 'text',
  autoFocus,
  rows,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  rows?: number;
}) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {multiline ? (
        <textarea value={value} placeholder={placeholder} rows={rows} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="arrow_drop_down" className="select-arrow" />
    </div>
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="grow">{label}</span>
      <span className="track">
        <span className="thumb" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: string }[];
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} type="button" className={`state ${o.value === value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.value === value ? <Icon name="check" /> : o.icon && <Icon name={o.icon} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
  colors = LINE_COLORS,
  allowNone,
}: {
  value: string | null;
  onChange: (c: string | null) => void;
  colors?: string[];
  allowNone?: boolean;
}) {
  const t = useT();
  const isCustom = value != null && !colors.some((c) => c.toLowerCase() === value.toLowerCase());
  return (
    <div className="swatches">
      {allowNone && (
        <button type="button" className={`swatch none ${value == null ? 'on' : ''}`} {...tip(t('noColor'))} onClick={() => onChange(null)}>
          <Icon name="format_color_reset" />
        </button>
      )}
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch ${value?.toLowerCase() === c.toLowerCase() ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        >
          {value?.toLowerCase() === c.toLowerCase() && <Icon name="check" />}
        </button>
      ))}
      <label className={`swatch custom ${isCustom ? 'on' : ''}`} style={isCustom ? { background: value! } : undefined} {...tip(t('custom'))}>
        {isCustom ? <Icon name="check" /> : <Icon name="colorize" />}
        <input type="color" value={value ?? '#888888'} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

// ---------------- dialog ----------------
export function Dialog({
  title,
  icon,
  onClose,
  children,
  actions,
  wide,
}: {
  title: string;
  icon?: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog">
        <div className="dialog-head">
          {icon && <Icon name={icon} style={{ color: 'var(--md-secondary)' }} />}
          <div className="headline-s">{title}</div>
        </div>
        <div className="dialog-body">{children}</div>
        {actions && <div className="dialog-actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------- confirm (promise-based) ----------------
const useConfirm = create<{ text: string | null; resolve?: (v: boolean) => void }>(() => ({ text: null }));

export function confirmDialog(text: string): Promise<boolean> {
  return new Promise((resolve) => useConfirm.setState({ text, resolve }));
}

export function ConfirmLayer() {
  const t = useT();
  const { text, resolve } = useConfirm();
  if (!text) return null;
  const done = (v: boolean) => {
    useConfirm.setState({ text: null, resolve: undefined });
    resolve?.(v);
  };
  return (
    <Dialog
      title={t('confirm')}
      icon="help"
      onClose={() => done(false)}
      actions={
        <>
          <Button onClick={() => done(false)}>{t('cancel')}</Button>
          <Button variant="filled" onClick={() => done(true)}>
            {t('yes')}
          </Button>
        </>
      }
    >
      <div className="body-m muted">{text}</div>
    </Dialog>
  );
}

// ---------------- menu ----------------
export interface MenuItem {
  icon?: string;
  label: string;
  onClick?: () => void;
  divider?: boolean;
  header?: boolean;
  trailing?: string;
  disabled?: boolean;
}

export function Menu({ anchor, items, onClose }: { anchor: HTMLElement | null; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const m = ref.current.getBoundingClientRect();
    let left = r.left;
    let top = r.bottom + 4;
    if (left + m.width > window.innerWidth - 8) left = r.right - m.width;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
    setPos({ left: Math.max(8, left), top });
  }, [anchor]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);
  if (!anchor) return null;
  return createPortal(
    <div className="menu" ref={ref} style={pos} role="menu">
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="menu-divider" />
        ) : it.header ? (
          <div key={i} className="menu-label">
            {it.label}
          </div>
        ) : (
          <button
            key={i}
            type="button"
            className="menu-item state"
            disabled={it.disabled}
            style={it.disabled ? { opacity: 0.38 } : undefined}
            onClick={() => {
              onClose();
              it.onClick?.();
            }}
          >
            {it.icon && <Icon name={it.icon} />}
            <span>{it.label}</span>
            {it.trailing && <span className="trailing">{it.trailing}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/** Small helper: returns [anchor, open(e), close] for menus. */
export function useMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return {
    anchor,
    open: (e: React.MouseEvent<HTMLElement>) => setAnchor(e.currentTarget),
    close: () => setAnchor(null),
  };
}
