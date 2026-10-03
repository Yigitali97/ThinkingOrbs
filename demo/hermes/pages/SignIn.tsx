// The demo sign-in: Hermes itself greets you, then a choice of one of the sample employees, no password, and on to wherever
// the visitor was headed.

import { BotOrb } from '../../../src/orbs';
import { navigate, useLocation } from '../../site/router';
import { DEMO_USERS, safeNext, signIn } from '../auth';
import { initials } from '../UserMenu';

const ROLE_LABEL = { leadership: 'Leadership', manager: 'Manager', developer: 'Developer' } as const;

export function SignIn() {
  const { search } = useLocation();
  const choose = (id: string) => {
    signIn(id);
    navigate(safeNext(new URLSearchParams(search).get('next')), { replace: true });
  };
  return (
    <div className="signin">
      <div className="signin-bot">
        <BotOrb size={160} state="idle" label="Hermes" />
      </div>
      <h1>Sign in to Hermes</h1>
      <p className="lede">This is a demo. Pick a sample employee to sign in as — no password needed.</p>
      <ul className="user-list">
        {DEMO_USERS.map((u) => (
          <li key={u.id}>
            <button type="button" className="user-card" onClick={() => choose(u.id)}>
              <span className="avatar" aria-hidden="true">
                {initials(u.name)}
              </span>
              <span className="user-card-text">
                <span className="user-card-name">{u.name}</span>
                <span className="user-card-title">{u.title}</span>
              </span>
              <span className="role-tag">{ROLE_LABEL[u.role]}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="fine">What Hermes tells you depends on the role you pick.</p>
    </div>
  );
}
