// The Hermes site: the signed-in guard, the sign-in screen, and for a signed-in user the workspace, where the address picks
// the dashboard shown in the canvas beside the conversation. Each address keeps its own document title.

import { useEffect } from 'react';
import { navigate, useLocation } from '../site/router';
import { guard, useUser } from './auth';
import { HERMES_NAME, HERMES_ROOT } from './config';
import { SignIn } from './pages/SignIn';
import { hermesPageMeta, hermesProjectId } from './routes';
import { Workspace } from './workspace/Workspace';
import { visibleProject } from './workspace/views';

const SIGN_IN = `${HERMES_ROOT}/sign-in`;

function setDescription(content: string) {
  let el = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!el) {
    el = document.createElement('meta');
    el.name = 'description';
    document.head.append(el);
  }
  el.content = content;
}

export function App() {
  const loc = useLocation();
  const user = useUser();
  const redirect = guard(loc.path, user);

  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect]);

  // a project the user can't see is titled as not found too; switching user can change that without a navigation
  const hidden = hermesProjectId(loc.path) !== null && !visibleProject(loc.path, user);
  useEffect(() => {
    const meta = hidden ? null : hermesPageMeta(loc.path);
    document.title = meta?.title ?? `Page not found · ${HERMES_NAME}`;
    if (meta) setDescription(meta.description);
  }, [loc.path, hidden]);

  if (redirect) return null;

  if (loc.path === SIGN_IN) {
    return (
      <div className="hermes signin-screen">
        <main id="main" className="signin-main route">
          <SignIn />
        </main>
      </div>
    );
  }

  // the guard has redirected every signed-out visitor, so a user is here
  if (!user) return null;
  return <Workspace user={user} />;
}
