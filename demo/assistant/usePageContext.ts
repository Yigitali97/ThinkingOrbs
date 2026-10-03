// A page tells the assistant what it is showing. Registers on mount and when page/id/title change, and falls back
// to an unknown page on unmount. The data it carries is refreshed on every render without re-registering.

import { useEffect } from 'react';
import { usePageRegistry } from './AssistantProvider';
import type { PageContext } from './protocol';

export function usePageContext(ctx: PageContext): void {
  const registry = usePageRegistry();
  const { page, id, title } = ctx;
  useEffect(() => {
    registry.register(ctx);
    return () => registry.reset();
    // keyed by page/id/title only; `data` is refreshed by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, page, id, title]);
  useEffect(() => {
    registry.refresh(ctx);
  });
}
