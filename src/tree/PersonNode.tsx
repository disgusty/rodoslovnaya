import { memo } from 'react';
import { useStore } from '../model/store';
import { lifeSpan, shortName } from '../model/relations';
import type { Orientation, Person } from '../model/types';
import { useT } from '../ui/i18n';
import { cardTint } from '../ui/theme';
import { Icon, hideTip, showTip } from '../ui/components';

interface Props {
  person: Person;
  x: number;
  y: number;
  selected: boolean;
  match: boolean;
  dim: boolean;
  branchColors?: string[];
  hasChildren: boolean;
  hiddenCount: number;
  collapsed: boolean;
  orientation: Orientation;
  dark: boolean;
}

/** A person's card on the tree canvas. */
export const PersonNode = memo(function PersonNode({
  person: p,
  x,
  y,
  selected,
  match,
  dim,
  branchColors,
  hasChildren,
  hiddenCount,
  collapsed,
  orientation,
  dark,
}: Props) {
  const t = useT();
  const { first, last } = shortName(p);
  const tint = p.cardColor ? cardTint(p.cardColor, dark) : null;
  const initials = ((p.firstName[0] ?? '') + (p.lastName[0] ?? '')).toUpperCase();
  const style: React.CSSProperties = tint ? { left: x, top: y, background: tint.bg, color: tint.fg, borderColor: p.cardColor! } : { left: x, top: y };
  const cls = [
    'pnode',
    `gender-${p.gender}`,
    p.living ? 'living' : 'deceased',
    selected && 'selected',
    match && 'match',
    dim && 'dim',
    tint && 'colored',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      style={style}
      onClick={() => useStore.getState().select(p.id)}
      onDoubleClick={() => useStore.getState().select(p.id, true)}
    >
      <div className="avatar">
        {p.photo ? <img src={p.photo} alt="" draggable={false} /> : initials || <Icon name="person" />}
        {p.living && <span className="life-dot" />}
      </div>
      <div className="info">
        <div className="last">{last || (first ? '' : t('unnamed'))}</div>
        <div className="first">{first}</div>
        <div className="dates">
          {!p.living && <span>†</span>}
          <span>{lifeSpan(p)}</span>
        </div>
      </div>
      {!p.living && <span className="ribbon" />}
      {branchColors && (
        <div className="branch-dots">
          {branchColors.slice(0, 5).map((c, i) => (
            <span key={i} style={{ background: c }} />
          ))}
        </div>
      )}
      {hasChildren && (
        <button
          className={`toggle ${orientation} ${collapsed ? 'collapsed' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            useStore.getState().toggleCollapsed(p.id);
          }}
          onMouseEnter={(e) => showTip(collapsed ? t('expandBranch') : t('collapseBranch'), e.clientX, e.clientY)}
          onMouseLeave={hideTip}
        >
          {collapsed ? `+${hiddenCount}` : <Icon name="remove" />}
        </button>
      )}
    </div>
  );
});
