// Holds one Conversation per (agent, user) and the panel state around it: open, inline, unread, the page context and the
// message box's draft and uploads, which outlive the panel closing, a page change and a breakpoint change.
// Switching user or agent disposes the old conversation, which aborts its reply and clears the thread and the draft.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { ChatAttachment } from '../chat-app/agent';
import { useUploads } from '../chat-app/useUploads';
import type { Upload } from '../chat-app/useUploads';
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

/** What is in the message box: kept here, so whichever composer is on screen picks up where the last one left off. */
export interface ComposerDraft {
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  uploads: Upload[];
  attachFiles(files: FileList | null): void;
  removeUpload(id: string): void;
  /** the finished uploads, handed to the conversation, which owns them from then on */
  takeReady(): ChatAttachment[];
}

const AssistantContext = createContext<AssistantValue | null>(null);
const PageRegistryContext = createContext<PageRegistry | null>(null);
const ComposerContext = createContext<ComposerDraft | null>(null);

export function useAssistant(): AssistantValue {
  const value = useContext(AssistantContext);
  if (!value) throw new Error('useAssistant must be used inside <AssistantProvider>');
  return value;
}

export function useComposerDraft(): ComposerDraft {
  const value = useContext(ComposerContext);
  if (!value) throw new Error('useComposerDraft must be used inside <AssistantProvider>');
  return value;
}

export function usePageRegistry(): PageRegistry {
  const registry = useContext(PageRegistryContext);
  if (!registry) throw new Error('usePageContext must be used inside <AssistantProvider>');
  return registry;
}

/** A reply that just finished, in any way but being stopped, while its answer is not on screen. Errors count, so they get noticed. */
export function marksUnread(wasBusy: boolean, s: ConversationSnapshot, view: { open: boolean; inline: boolean }): boolean {
  const last = s.turns[s.turns.length - 1];
  return wasBusy && !s.busy && !!last && last.reply.state !== 'stopped' && !view.open && !view.inline;
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

  // a reply that finishes while the panel is closed and not inline leaves an unread dot; a new conversation starts read
  useEffect(() => {
    setUnread(false);
    let wasBusy = conversation.getSnapshot().busy;
    return conversation.subscribe(() => {
      const s = conversation.getSnapshot();
      if (marksUnread(wasBusy, s, { open: openRef.current, inline: inlineRef.current })) setUnread(true);
      wasBusy = s.busy;
    });
  }, [conversation]);

  // the message box: a new conversation (another user) starts with an empty one
  const [draft, setDraft] = useState('');
  const { uploads, attachFiles, removeUpload, clearUploads, takeReady } = useUploads();
  useEffect(() => {
    setDraft('');
    clearUploads();
  }, [conversation, clearUploads]);
  const composer = useMemo<ComposerDraft>(
    () => ({ draft, setDraft, uploads, attachFiles, removeUpload, takeReady }),
    [draft, uploads, attachFiles, removeUpload, takeReady],
  );

  const value = useMemo<AssistantValue>(
    () => ({ agent, user, conversation, snapshot, page, open, setOpen, inline, setInline, unread }),
    [agent, user, conversation, snapshot, page, open, setOpen, inline, unread],
  );

  return (
    <PageRegistryContext.Provider value={registry}>
      <AssistantContext.Provider value={value}>
        <ComposerContext.Provider value={composer}>{children}</ComposerContext.Provider>
      </AssistantContext.Provider>
    </PageRegistryContext.Provider>
  );
}
