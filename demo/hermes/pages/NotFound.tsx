// What Hermes shows for an address that has no page: the path asked for and a way back home.

import { Link, useLocation } from '../../site/router';
import { HERMES_ROOT } from '../config';

export function NotFound() {
  const { path } = useLocation();
  return (
    <div className="page page-narrow not-found">
      <h1>No page at {path}</h1>
      <p className="lede">The link may be old, or the address may have a typo.</p>
      <div className="actions actions-start">
        <Link to={HERMES_ROOT} className="btn btn-primary">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
