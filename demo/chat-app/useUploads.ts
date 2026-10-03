// Simulated file uploads for a composer: attach, progress, remove, and take the finished ones.
// Shared by the chat sample and the assistant panel so the IngestOrb has real progress to show.
// Image previews are object URLs: this hook revokes the ones still in its list; takeReady hands the rest to the caller.

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
  // object URLs of uploads still in the list; a URL leaves this set when its upload is removed (revoked) or taken (handed over)
  const urls = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const revoke = (url?: string) => {
    if (url && urls.current.delete(url)) URL.revokeObjectURL(url);
  };

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current.clear();
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
          if (url) urls.current.add(url);
          return { id: uid(), name: file.name, type: file.type, size: file.size, file, url };
        })
      );
    },
    [addUploads]
  );

  const removeUpload = useCallback((id: string) => {
    revoke(uploadsRef.current.find((u) => u.id === id)?.url);
    setUploads((list) => list.filter((u) => u.id !== id));
  }, []);

  /** Drops every upload in the list and revokes its preview. */
  const clearUploads = useCallback(() => {
    uploadsRef.current.forEach((u) => revoke(u.url));
    setUploads([]);
  }, []);

  /**
   * The finished uploads as attachments; removes them from the list. Their preview URLs now belong to the caller,
   * which revokes them once nothing shows the attachment any more.
   */
  const takeReady = useCallback((): ChatAttachment[] => {
    const ready = uploadsRef.current.filter((u) => u.status === 'done');
    if (!ready.length) return [];
    for (const u of ready) if (u.url) urls.current.delete(u.url);
    setUploads((list) => list.filter((u) => u.status !== 'done'));
    return ready.map(({ progress: _p, status: _s, ...att }) => att);
  }, []);

  return { uploads, attachFiles, addUploads, removeUpload, clearUploads, takeReady };
}
