// Holds one Conversation per (agent, user) and the panel state around it: open, inline, unread and the page context.
// Switching user or agent disposes the old conversation, which aborts its reply and clears the thread.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createConversation } from './conversation';
import type { Conversation, ConversationSnapshot } from './conversation';
import type { AgentDefinition, PageContext, User } from './protocol';

export interface AssistantValue {
  agent: AgentDefinition;
  user?: User;
  conversation: Conversation;
  snapshot: ConversationSnapshot;
  page: PageContext;
  open: boolean;
  setOpen(o: boolean, opener?: HTMLElement | null): void;
  inline: boolean;
  setInline(on: boolean): void;
  unread: boolean;
}

/** What usePageContext talks to: `register` re-renders the provider, `refresh` only updates what the brain will read. */
export interface PageRegistry {
  register(ctx: PageContext): void;
  refresh(ctx: PageContext): void;
  reset(): void;
}

const AssistantContext = createContext<AssistantValue | null>(null);
const PageRegistryContext = createContext<PageRegistry | null>(null);

export function useAssistant(): AssistantValue {
  const value = useContext(AssistantContext);
  if (!value) throw new Error('useAssistant must be used inside <AssistantProvider>');
  return value;
}

export function usePageRegistry(): PageRegistry {
  const registry = useContext(PageRegistryContext);
  if (!registry) throw new Error('usePageContext must be used inside <AssistantProvider>');
  return registry;
}

const unknownPage = (): PageContext => ({ page: 'unknown', title: typeof document === 'undefined' ? '' : document.title });

export function AssistantProvider({
  agent,
  user,
  now,
  children,
}: {
  agent: AgentDefinition;
  user?: User;
  now?: () => Date;
  children: ReactNode;
}) {
  const [page, setPage] = useState<PageContext>(unknownPage);
  const pageRef = useRef(page);
  const nowRef = useRef(now);
  nowRef.current = now;
  const userRef = useRef(user);
  userRef.current = user;

  const registry = useMemo<PageRegistry>(
    () => ({
      register(ctx) {
        pageRef.current = ctx;
        setPage(ctx);
      },
      refresh(ctx) {
        pageRef.current = ctx;
      },
      reset() {
        const ctx = unknownPage();
        pageRef.current = ctx;
        setPage(ctx);
      },
    }),
    [],
  );

  // A conversation per (agent, user id). Under StrictMode the effect below runs, cleans up and runs again, which would leave
  // a disposed store in use, so `epoch` forces a fresh one when the effect finds the memoized store already disposed.
  const [epoch, setEpoch] = useState(0);
  const disposedStores = useRef(new WeakSet<Conversation>());
  const userId = user?.id;
  const conversation = useMemo(
    () =>
      createConversation(agent, {
        user: userRef.current,
        page: () => pageRef.current,
        now: () => nowRef.current?.() ?? new Date(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent, userId, epoch],
  );
  useEffect(() => {
    if (disposedStores.current.has(conversation)) {
      setEpoch((e) => e + 1);
      return;
    }
    return () => {
      disposedStores.current.add(conversation);
      conversation.dispose();
    };
  }, [conversation]);

  const snapshot = useSyncExternalStore(conversation.subscribe, conversation.getSnapshot, conversation.getSnapshot);

  const [open, setOpenState] = useState(false);
  const [inline, setInline] = useState(false);
  const [unread, setUnread] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const inlineRef = useRef(inline);
  inlineRef.current = inline;
  const openerRef = useRef<HTMLElement | null>(null);

  const setOpen = useCallback((o: boolean, opener?: HTMLElement | null) => {
    setOpenState(o);
    if (o) {
      setUnread(false);
      if (opener !== undefined) openerRef.current = opener;
      return;
    }
    const el = openerRef.current;
    openerRef.current = null;
    // give the panel a tick to unmount before focus goes back to what opened it
    if (el) setTimeout(() => el.isConnected && el.focus(), 0);
  }, []);

  // a reply that finishes while the panel is closed and not inline leaves an unread dot
  useEffect(() => {
    let wasBusy = conversation.getSnapshot().busy;
    return conversation.subscribe(() => {
      const s = conversation.getSnapshot();
      const last = s.turns[s.turns.length - 1];
      if (wasBusy && !s.busy && last?.reply.state === 'done' && !openRef.current && !inlineRef.current) setUnread(true);
      wasBusy = s.busy;
    });
  }, [conversation]);

  const value = useMemo<AssistantValue>(
    () => ({ agent, user, conversation, snapshot, page, open, setOpen, inline, setInline, unread }),
    [agent, user, conversation, snapshot, page, open, setOpen, inline, unread],
  );

  return (
    <PageRegistryContext.Provider value={registry}>
      <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
    </PageRegistryContext.Provider>
  );
}
