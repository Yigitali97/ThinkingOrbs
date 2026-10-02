// Message box: attachments, dictation, send/stop, and the suggestion bar underneath.

import { CSSProperties, KeyboardEvent, ReactNode, useRef, useState } from 'react';
import { IngestOrb, VoiceOrb } from '../../src/orbs';
import { Hint, HINTS } from './hints';
import type { Upload } from './useChat';
import type { useDictation } from './useDictation';

const DEFAULT_NOTE: ReactNode = (
  <>
    Replies stream with a <strong>TokenOrb</strong>. The avatar is a <strong>MascotOrb</strong>, and the dot beside its status is a <strong>StatusOrb</strong>.
  </>
);

function UploadTile({ up, onRemove }: { up: Upload; onRemove: () => void }) {
  const thumb = up.url ?? up.frames?.[Math.floor((up.frames.length - 1) / 2)];
  const ready = up.status === 'done';
  return (
    <div className="ca-upload" data-ready={ready}>
      {thumb && ready ? <img src={thumb} alt="" /> : <IngestOrb name={up.name} progress={up.progress} status={up.status} width={132} height={74} showCaption={false} />}
      <div className="ca-upload-meta">
        <span title={up.name}>{up.name}</span>
        <small>{ready ? 'Ready' : `${Math.round(up.progress * 100)}%`}</small>
      </div>
      <button type="button" className="ca-x" onClick={onRemove} aria-label={`Remove ${up.name}`}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function Composer({
  draft,
  setDraft,
  uploads,
  busy,
  dictation,
  onSend,
  onStop,
  onAttach,
  onRemoveUpload,
  onHint,
}: {
  draft: string;
  setDraft: (v: string) => void;
  uploads: Upload[];
  busy: boolean;
  dictation: ReturnType<typeof useDictation>;
  onSend: () => void;
  onStop: () => void;
  onAttach: (files: FileList | null) => void;
  onRemoveUpload: (id: string) => void;
  onHint: (h: Hint) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<Hint | null>(null);
  const uploading = uploads.some((u) => u.status !== 'done');
  const canSend = !busy && !uploading && (draft.trim().length > 0 || uploads.some((u) => u.status === 'done'));

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <form
      className="ca-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
    >
      {uploads.length > 0 && (
        <div className="ca-uploads">
          {uploads.map((u) => (
            <UploadTile key={u.id} up={u} onRemove={() => onRemoveUpload(u.id)} />
          ))}
        </div>
      )}

      <div className="ca-input" data-dictating={dictation.active}>
        <button type="button" className="ca-tool" onClick={() => fileRef.current?.click()} aria-label="Attach a file, image or video" title="Attach">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            onAttach(e.target.files);
            e.target.value = '';
          }}
        />
        <textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={dictation.active ? 'Listening…' : 'Message Orb Assistant'}
          aria-label="Message"
        />
        <button
          type="button"
          className="ca-tool ca-mic"
          data-active={dictation.active}
          onClick={() => (dictation.active ? dictation.stop() : void dictation.start(draft))}
          disabled={!dictation.supported || busy}
          aria-pressed={dictation.active}
          aria-label={dictation.active ? 'Stop dictation' : 'Dictate'}
          title={dictation.supported ? 'Dictate' : "Dictation isn't available in this browser"}
        >
          {dictation.active ? (
            <VoiceOrb size={34} stream={dictation.stream} sensitivity={1.8} label={null} />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          )}
        </button>
        {busy ? (
          <button type="button" className="ca-send" data-stop onClick={onStop} aria-label="Stop generating">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="1" y="1" width="10" height="10" rx="2" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button type="submit" className="ca-send" disabled={!canSend} aria-label="Send">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        )}
      </div>

      <div className="ca-hints" role="group" aria-label="Suggestions">
        {HINTS.map((h) => (
          <button
            key={h.id}
            type="button"
            className="ca-hint"
            style={{ '--hint': h.color } as CSSProperties}
            data-active={(h.dictate && dictation.active) || undefined}
            disabled={busy || (h.dictate && !dictation.supported)}
            onClick={() => onHint(h)}
            onMouseEnter={() => setNote(h)}
            onFocus={() => setNote(h)}
            onMouseLeave={() => setNote(null)}
            onBlur={() => setNote(null)}
          >
            <i aria-hidden="true" />
            {h.label}
          </button>
        ))}
      </div>
      <p className="ca-note" aria-live="polite" data-error={dictation.error ? '' : undefined}>
        {dictation.error ? (
          dictation.error
        ) : note ? (
          <>
            <strong style={{ color: note.color }}>{note.orb}.</strong> {note.about}
          </>
        ) : (
          DEFAULT_NOTE
        )}
      </p>
    </form>
  );
}
