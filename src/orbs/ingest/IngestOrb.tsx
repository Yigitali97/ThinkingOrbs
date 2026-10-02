'use client';

import { CSSProperties, useEffect, useRef } from 'react';
import { createIngestOrb, IngestKind, IngestOrbHandle, IngestStatus } from './engine';

export interface IngestOrbProps {
  /** File name; also used to pick the card type and badge (e.g. "report.pdf" → PDF). */
  name?: string;
  /** Override the detected file type. */
  kind?: IngestKind;
  /** 0..1 — upload / read progress. Dots leave the card as it rises. */
  progress: number;
  /** uploading · reading · done · error */
  status?: IngestStatus;
  width?: number;
  height?: number;
  /** Show "Uploading report.pdf · 42%" under the orb. */
  showCaption?: boolean;
  className?: string;
  style?: CSSProperties;
}

const EXT_KIND: Record<string, IngestKind> = {
  pdf: 'pdf',
  doc: 'doc', docx: 'doc', txt: 'doc', md: 'doc', rtf: 'doc', pages: 'doc',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', numbers: 'sheet',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', heic: 'image',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', flac: 'audio',
  js: 'code', ts: 'code', tsx: 'code', py: 'code', json: 'code', html: 'code', css: 'code', sql: 'code',
};

/** Guess the card type from a file name's extension. */
export function kindFromName(name = ''): IngestKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_KIND[ext] ?? 'file';
}

function caption(status: IngestStatus, name: string, progress: number) {
  switch (status) {
    case 'uploading':
      return `Uploading ${name} · ${Math.round(progress * 100)}%`;
    case 'reading':
      return `Reading ${name}`;
    case 'done':
      return `${name} ready`;
    case 'error':
      return `Couldn't read ${name}`;
  }
}

export function IngestOrb({
  name = 'file',
  kind,
  progress,
  status = 'uploading',
  width = 360,
  height = 220,
  showCaption = true,
  className,
  style,
}: IngestOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<IngestOrbHandle | null>(null);
  const resolvedKind = kind ?? kindFromName(name);
  const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase().slice(0, 4) : undefined;
  const badge = !kind && resolvedKind !== 'file' && resolvedKind !== 'code' ? ext : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createIngestOrb(canvas, { width, height, progress, status, kind: resolvedKind, badge });
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    orbRef.current?.update({ width, height, progress, status, kind: resolvedKind, badge });
  }, [width, height, progress, status, resolvedKind, badge]);

  const text = caption(status, name, progress);
  const color = status === 'done' ? '#34d399' : status === 'error' ? '#f05252' : '#b9b9c2';

  return (
    <div className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, ...style }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width, height, maxWidth: '100%' }}
        role="progressbar"
        aria-label={text}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((status === 'uploading' ? progress : 1) * 100)}
      />
      {showCaption && (
        <div aria-hidden="true" style={{ minHeight: '1.4em', fontSize: 14, color, transition: 'color 0.4s', fontVariantNumeric: 'tabular-nums' }}>
          {text}
        </div>
      )}
    </div>
  );
}

export default IngestOrb;
