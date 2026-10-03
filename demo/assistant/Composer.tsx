// The assistant's message box: attachments, dictation, and Send (Stop while a reply runs). Enter sends, Shift+Enter is a new line.
// Sending while a reply runs stops that reply first; the conversation store takes care of the order.

import { KeyboardEvent, RefObject, useEffect, useId, useRef, useState } from 'react';
import { VoiceOrb } from '../../src/orbs';
import { useDictation } from '../chat-app/useDictation';
import { useUploads } from '../chat-app/useUploads';
import { useAssistant } from './AssistantProvider';

/** Moves focus to the assistant's message box, wherever it is on screen. */
export function focusComposer(): boolean {
  const el = typeof document === 'undefined' ? null : document.querySelector<HTMLTextAreaElement>('[data-assistant-composer]');
  el?.focus();
  return !!el;
}

const MAX_HEIGHT = 160;

export function Composer({ inputRef }: { inputRef?: RefObject<HTMLTextAreaElement> }) {
  const { agent, conversation, snapshot } = useAssistant();
  const [draft, setDraft] = useState('');
  const { uploads, attachFiles, removeUpload, takeReady } = useUploads();
  const dictation = useDictation(setDraft);
  const fileRef = useRef<HTMLInputElement>(null);
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const textRef = inputRef ?? ownRef;
  const errorId = useId();
  const busy = snapshot.busy;
  const uploading = uploads.some((u) => u.status !== 'done');
  const canSend = !uploading && (draft.trim().length > 0 || uploads.some((u) => u.status === 'done'));

  // grow with the text, up to a limit
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [draft, textRef]);

  const send = () => {
    if (!canSend) return;
    if (dictation.active) dictation.stop();
    void conversation.send(draft, takeReady());
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <form
      className="as-composer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {uploads.length > 0 && (
        <ul className="as-uploads" aria-label="Attachments">
          {uploads.map((u) => (
            <li key={u.id} className="as-upload" data-ready={u.status === 'done'}>
              {u.url && u.status === 'done' ? <img src={u.url} alt="" /> : <span className="as-upload-icon" aria-hidden="true" />}
              <span className="as-upload-name" title={u.name}>
                {u.name}
              </span>
              <span className="as-upload-progress">{u.status === 'done' ? 'Ready' : `${Math.round(u.progress * 100)}%`}</span>
              <button type="button" className="as-icon-btn as-upload-remove" onClick={() => removeUpload(u.id)} aria-label={`Remove ${u.name}`}>
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="as-input" data-dictating={dictation.active}>
        <button type="button" className="as-icon-btn" onClick={() => fileRef.current?.click()} aria-label="Attach files or images" title="Attach files or images">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.5 11.5 12 20a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
          </svg>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          onChange={(e) => {
            attachFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <textarea
          ref={textRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={dictation.active ? 'Listening…' : `Ask ${agent.name} anything`}
          aria-label={`Ask ${agent.name}`}
          aria-describedby={dictation.error ? errorId : undefined}
          data-assistant-composer=""
        />
        {dictation.supported && (
          <button
            type="button"
            className="as-icon-btn as-mic"
            data-active={dictation.active}
            onClick={() => (dictation.active ? dictation.stop() : void dictation.start(draft))}
            aria-pressed={dictation.active}
            aria-label={dictation.active ? 'Stop dictation' : 'Dictate'}
            title={dictation.active ? 'Stop dictation' : 'Dictate'}
          >
            {dictation.active ? (
              <VoiceOrb size={30} stream={dictation.stream} sensitivity={1.8} label={null} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
              </svg>
            )}
          </button>
        )}
        {busy ? (
          <button type="button" className="as-send" data-stop="" onClick={() => conversation.stop()} aria-label="Stop" title="Stop">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="1" y="1" width="10" height="10" rx="2" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button type="submit" className="as-send" disabled={!canSend} aria-label="Send" title="Send">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        )}
      </div>
      {/* always mounted, so a new message in it is announced */}
      <p className="as-composer-note" id={errorId} role="status">
        {dictation.error ?? ''}
      </p>
    </form>
  );
}
