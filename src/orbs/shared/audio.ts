/** Reads loudness, three voice bands and a log-spaced spectrum from a MediaStream. */
export class StreamAnalyser {
  private ctx: AudioContext;
  private src: MediaStreamAudioSourceNode;
  private analyser: AnalyserNode;
  // inferred types stay compatible with both older and newer TypeScript lib typings
  private time = new Uint8Array(0);
  private freq = new Uint8Array(0);

  constructor(stream: MediaStream) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.src = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.6;
    this.src.connect(this.analyser);
    this.time = new Uint8Array(this.analyser.fftSize);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
  }

  read(): { level: number; bands: [number, number, number] } {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.analyser.getByteTimeDomainData(this.time);
    let sum = 0;
    for (let i = 0; i < this.time.length; i++) {
      const v = (this.time[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.time.length);
    const level = Math.min(1, Math.max(0, (rms - 0.012) * 7));

    this.analyser.getByteFrequencyData(this.freq);
    // voice lives mostly below ~4 kHz; split the lower bins into three bands
    const n = this.freq.length;
    const band = (from: number, to: number) => {
      let s = 0;
      const a = Math.floor(from * n), b = Math.max(a + 1, Math.floor(to * n));
      for (let i = a; i < b; i++) s += this.freq[i];
      return Math.min(1, s / (b - a) / 200);
    };
    return { level, bands: [band(0.01, 0.06), band(0.06, 0.16), band(0.16, 0.35)] };
  }

  /** Fill `out` with 0..1 energies over log-spaced bands of the voice range. Call after read(). */
  spectrum(out: Float32Array) {
    const n = this.freq.length;
    const lo = Math.log(2), hi = Math.log(n * 0.4);
    for (let i = 0; i < out.length; i++) {
      const a = Math.floor(Math.exp(lo + ((hi - lo) * i) / out.length));
      const b = Math.max(a + 1, Math.floor(Math.exp(lo + ((hi - lo) * (i + 1)) / out.length)));
      let s = 0;
      for (let k = a; k < b; k++) s += this.freq[k];
      out[i] = Math.min(1, s / (b - a) / 210);
    }
  }

  close() {
    this.src.disconnect();
    void this.ctx.close();
  }
}
