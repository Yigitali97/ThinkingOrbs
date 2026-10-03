// A link block: a card that takes you to a page in the site.

import { Link } from '../../site/router';
import type { Block } from '../protocol';

export type LinkCardProps = Omit<Extract<Block, { kind: 'link' }>, 'kind'>;

export function LinkCard({ label, href }: LinkCardProps) {
  return (
    <Link to={href} className="as-linkcard">
      <span>{label}</span>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
