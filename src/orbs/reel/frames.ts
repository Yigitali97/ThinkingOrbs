/**
 * Grab evenly spaced thumbnails from a video, in the browser.
 * Works with local files (`File`/`Blob`) and same-origin or CORS-enabled URLs.
 * Resolves with JPEG data URLs, ready for `<ReelOrb frames={…} />`.
 */
export async function captureFrames(src: string | Blob, count = 12, width = 192): Promise<string[]> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  if (typeof src === 'string' && !/^(data|blob):/.test(src)) video.crossOrigin = 'anonymous';

  const once = (type: string, ms = 8000) =>
    new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        video.removeEventListener(type, done);
        video.removeEventListener('error', fail);
        resolve();
      };
      const fail = () => {
        clearTimeout(timer);
        video.removeEventListener(type, done);
        reject(new Error('Could not read the video.'));
      };
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${type}".`)), ms);
      video.addEventListener(type, done, { once: true });
      video.addEventListener('error', fail, { once: true });
    });

  try {
    video.src = url;
    await once('loadeddata');
    let duration = video.duration;
    if (!isFinite(duration)) {
      // browser-recorded WebM often reports Infinity until you seek to the end
      video.currentTime = 1e101;
      await once('seeked');
      duration = video.duration;
    }
    if (!isFinite(duration) || duration <= 0) duration = 0;
    const height = Math.round(width * (video.videoHeight / video.videoWidth || 9 / 16));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const frames: string[] = [];
    for (let i = 0; i < count; i++) {
      video.currentTime = duration * ((i + 0.5) / count);
      await once('seeked');
      ctx.drawImage(video, 0, 0, width, height);
      frames.push(canvas.toDataURL('image/jpeg', 0.72));
    }
    return frames;
  } finally {
    video.removeAttribute('src');
    video.load();
    if (typeof src !== 'string') URL.revokeObjectURL(url);
  }
}
