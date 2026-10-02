import { GazeOrb } from '../../../src/orbs';
import { Link, useLocation } from '../router';

export function NotFound() {
  const { path } = useLocation();
  return (
    <div className="page page-narrow not-found">
      <GazeOrb size={140} label={null} />
      <h1>No page at {path}</h1>
      <p className="lede">The link may be old, or the address may have a typo. Every orb has its own page under Components.</p>
      <div className="actions">
        <Link to="/" className="btn btn-primary">
          Browse components
        </Link>
        <Link to="/examples" className="btn">
          See the examples
        </Link>
      </div>
    </div>
  );
}
