// Simulated file uploads for a composer: attach, progress, remove, and take the finished ones.
// Shared by the chat sample and the assistant panel so the IngestOrb has real progress to show.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IngestStatus } from '../../src/orbs';
import type { ChatAttachment } from './agent';

export interface Upload extends ChatAttachment {
  progress: number;
  status: IngestStatus;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function useUploads() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  // latest rendered uploads, readable from callbacks without stale closures
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  const urls = useRef<string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  /** Simulated upload, so the IngestOrb in the composer has real progress to show. */
  const addUploads = useCallback((atts: ChatAttachment[]) => {
    for (const att of atts) {
      setUploads((list) => [...list, { ...att, progress: 0, status: 'uploading' }]);
      let p = 0;
      const tick = () => {
        p = Math.min(1, p + 0.07 + Math.random() * 0.1);
        setUploads((list) => list.map((u) => (u.id === att.id ? { ...u, progress: p, status: p >= 1 ? 'reading' : 'uploading' } : u)));
        if (p < 1) timers.current.push(setTimeout(tick, 110));
        else timers.current.push(setTimeout(() => setUploads((list) => list.map((u) => (u.id === att.id ? { ...u, status: 'done' } : u))), 600));
      };
      timers.current.push(setTimeout(tick, 150));
    }
  }, []);

  const attachFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      addUploads(
        Array.from(files).map((file) => {
          const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
          if (url) urls.current.push(url);
          return { id: uid(), name: file.name, type: file.type, size: file.size, file, url };
        })
      );
    },
    [addUploads]
  );

  const removeUpload = useCallback((id: string) => setUploads((list) => list.filter((u) => u.id !== id)), []);

  /** The finished uploads as attachments; removes them from the list. */
  const takeReady = useCallback((): ChatAttachment[] => {
    const ready = uploadsRef.current.filter((u) => u.status === 'done');
    if (!ready.length) return [];
    setUploads((list) => list.filter((u) => u.status !== 'done'));
    return ready.map(({ progress: _p, status: _s, ...att }) => att);
  }, []);

  return { uploads, attachFiles, addUploads, removeUpload, takeReady };
}
