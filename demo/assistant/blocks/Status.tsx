// A status block: a project's health as a labelled badge (never colour alone), the reasons, its sources and a link to it.

import { Link } from '../../site/router';
import type { Block } from '../protocol';

export type StatusProps = Omit<Extract<Block, { kind: 'status' }>, 'kind'>;

export const STATUS_LABEL: Record<StatusProps['status'], string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  'off-track': 'Off track',
};

const GLYPH: Record<StatusProps['status'], string> = {
  'on-track': 'M3 6.2 5 8.2 9 4',
  'at-risk': 'M6 3v3.6M6 8.6v.1',
  'off-track': 'M3.8 3.8l4.4 4.4M8.2 3.8 3.8 8.2',
};

export function StatusBadge({ status }: { status: StatusProps['status'] }) {
  return (
    <span className="as-badge" data-status={status}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d={GLYPH[status]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{STATUS_LABEL[status]}</span>
    </span>
  );
}

export function Status({ title, status, reasons, sources, href }: StatusProps) {
  return (
    <section className="as-status" data-status={status} aria-label={`${title}: ${STATUS_LABEL[status]}`}>
      <div className="as-status-head">
        <h3>{title}</h3>
        <StatusBadge status={status} />
      </div>
      {reasons.length > 0 && (
        <ul className="as-status-reasons">
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <div className="as-status-foot">
        {sources.length > 0 && <span>Sources: {sources.join(', ')}</span>}
        {href && (
          <Link to={href} className="as-status-link">
            Open {title}
          </Link>
        )}
      </div>
    </section>
  );
}
