import { useState } from 'react';
import { useStore } from '../model/store';
import type { Branch, Corner } from '../model/types';
import { useT } from '../ui/i18n';
import { Button, Icon } from '../ui/components';

export function EmptyState() {
  const t = useT();
  const st = useStore.getState;
  return (
    <div className="empty">
      <div>
        <Icon name="family_history" className="big-icon" />
        <div className="headline-s">{t('emptyTitle')}</div>
        <div className="body-m muted">{t('emptyText')}</div>
        <div className="row">
          <Button variant="filled" icon="person_add" onClick={() => st().select(st().addPerson(), true)}>
            {t('addPerson')}
          </Button>
          <Button variant="outlined" icon="auto_stories" onClick={async () => (await import('../model/demo')).loadDemo()}>
            {t('loadDemo')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Living/deceased symbols and the list of highlighted branches with their comments. */
export function Legend({ corner, branches }: { corner: Corner; branches: Branch[] }) {
  const t = useT();
  // collapsed by default on phones, where it would cover a large part of the tree
  const [open, setOpen] = useState(() => window.innerWidth > 720);
  return (
    <div className={`legend ${corner}`}>
      <div className="legend-head" onClick={() => setOpen(!open)}>
        <Icon name="info" style={{ fontSize: 18 }} />
        {t('legend')}
        <Icon name={open ? 'expand_less' : 'expand_more'} />
      </div>
      {open && (
        <div className="legend-body">
          <div className="li">
            <span className="legend-sample">
              <span className="life-dot" />
            </span>
            <span>{t('living')}</span>
          </div>
          <div className="li">
            <span className="legend-sample">
              <span className="ribbon" />
            </span>
            <span>{t('deceased')}</span>
          </div>
          {branches.map((b) => (
            <div className="li" key={b.id}>
              <span className="bar" style={{ background: b.color }} />
              <span>
                <b>{b.name}</b>
                {b.comment && <div className="c">{b.comment}</div>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
