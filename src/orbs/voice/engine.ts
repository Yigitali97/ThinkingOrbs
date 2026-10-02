/*
 * Voice Orb engine — a glowing gradient ring rendered with a WebGL shader.
 * Its outline breathes and wobbles subtly with audio: either a MediaStream
 * (e.g. the microphone) analysed internally, or any level you supply.
 */

export interface VoiceOrbOptions {
  /** CSS pixel width/height of the canvas. */
  size?: number;
  /** Audio to react to; the orb analyses it internally. */
  stream?: MediaStream | null;
  /** Alternative to `stream`: called every frame, return 0..1. */
  getLevel?: () => number;
  /** Multiplier for how strongly the ring reacts. */
  sensitivity?: number;
}

export interface VoiceOrbHandle {
  update(opts: VoiceOrbOptions): void;
  destroy(): void;
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uLevel;   // overall loudness 0..1
uniform vec3 uBands;    // low / mid / high energy 0..1
uniform float uSpin;    // accumulated color rotation
uniform float uPx;      // one pixel in uv units

const float TAU = 6.28318530718;

// Ring colors by angle (0 = right, counter-clockwise), from the reference.
vec3 palette(float a) {
  vec3 lavender = vec3(0.64, 0.44, 1.00);
  vec3 violet   = vec3(0.55, 0.26, 0.95);
  vec3 indigo   = vec3(0.36, 0.42, 0.92);
  vec3 cyan     = vec3(0.30, 0.78, 0.95);
  vec3 ice      = vec3(0.86, 0.92, 1.00);
  float t = fract(a / TAU) * 5.0;
  if (t < 1.0) return mix(lavender, violet, smoothstep(0.0, 1.0, t));
  if (t < 2.0) return mix(violet, indigo, smoothstep(1.0, 2.0, t));
  if (t < 3.0) return mix(indigo, cyan, smoothstep(2.0, 3.0, t));
  if (t < 4.0) return mix(cyan, ice, smoothstep(3.0, 4.0, t));
  return mix(ice, lavender, smoothstep(4.0, 5.0, t));
}

// Brightness by angle: hottest at lower-right, dimmest at upper-left.
float heat(float a) {
  return 0.55 + 0.45 * pow(0.5 + 0.5 * cos(a + 0.9), 2.0);
}

void main() {
  vec2 p = vUv;                 // -1..1, y up
  float r = length(p);
  float a = atan(p.y, p.x);

  // wobbly outline: a few slow harmonics, pushed by the audio bands
  float wob = 0.010 + 0.024 * uBands.x;
  float wob2 = 0.008 + 0.018 * uBands.y;
  float wob3 = 0.004 + 0.012 * uBands.z;
  float R = 0.78 * (1.0 + 0.05 * uLevel)
    + wob  * sin(2.0 * a + uTime * 0.55)
    + wob2 * sin(3.0 * a - uTime * 0.80 + 1.3)
    + wob3 * sin(5.0 * a + uTime * 1.30 + 2.1);

  float d = r - R;              // <0 inside the ring edge, >0 outside
  float ca = a - uSpin;

  // profile: crisp bright edge, long soft glow inward, short halo outward
  float edge = exp(-abs(d) / (0.007 + uPx));
  float inner = d < 0.0 ? exp(d / 0.14) : 0.0;
  float body = d < 0.0 ? exp(d / 0.07) : exp(-d / 0.011);
  float halo = exp(-max(d, 0.0) / 0.06) * smoothstep(-0.03, 0.0, d);

  float h = heat(ca);
  vec3 col = palette(ca);
  vec3 light = col * (0.35 * inner + 1.9 * body + 0.45 * halo) * h
             + mix(col, vec3(1.0), 0.3) * edge * 0.8 * h * h;
  light *= 1.0 + 0.35 * uLevel;

  // tone curve, then premultiplied alpha so it sits on any background
  light = 1.0 - exp(-light);
  float alpha = clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0);
  gl_FragColor = vec4(light, alpha);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('VoiceOrb shader: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

/** Reads loudness and three frequency bands from a MediaStream. */
class StreamAnalyser {
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

  close() {
    this.src.disconnect();
    void this.ctx.close();
  }
}

export function createVoiceOrb(canvas: HTMLCanvasElement, opts: VoiceOrbOptions = {}): VoiceOrbHandle {
  const o: VoiceOrbOptions = { size: 420, sensitivity: 1, ...opts };
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: true, alpha: true });
  if (!gl) throw new Error('VoiceOrb: WebGL unavailable');

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uLevel = gl.getUniformLocation(prog, 'uLevel');
  const uBands = gl.getUniformLocation(prog, 'uBands');
  const uSpin = gl.getUniformLocation(prog, 'uSpin');
  const uPx = gl.getUniformLocation(prog, 'uPx');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = o.size || 420;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.uniform1f(uPx, 2 / canvas.width);
  }
  resize();

  let analyser: StreamAnalyser | null = null;
  let analysedStream: MediaStream | null = null;
  function syncStream() {
    const s = o.stream || null;
    if (s === analysedStream) return;
    analyser?.close();
    analyser = s ? new StreamAnalyser(s) : null;
    analysedStream = s;
  }
  syncStream();

  const reduceMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const start = performance.now();
  let last = start;
  let level = 0;
  const bands: [number, number, number] = [0, 0, 0];
  let spin = 0;
  let raf = 0;

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - start) / 1000;

    let target = 0;
    let tb: [number, number, number] = [0, 0, 0];
    if (analyser) {
      const r = analyser.read();
      target = r.level;
      tb = r.bands;
    } else if (o.getLevel) {
      target = Math.min(1, Math.max(0, o.getLevel()));
      tb = [target, target * 0.8, target * 0.6];
    }
    const s = o.sensitivity ?? 1;
    target = Math.min(1, target * s);
    // fast attack, slow release keeps the movement smooth
    const ease = (cur: number, to: number) => cur + (to - cur) * (1 - Math.exp(-(to > cur ? 14 : 4) * dt));
    level = ease(level, target);
    for (let i = 0; i < 3; i++) bands[i] = ease(bands[i], Math.min(1, tb[i] * s));

    spin += dt * (reduceMotion ? 0.05 : 0.18 + 0.9 * level);

    gl!.uniform1f(uTime, reduceMotion ? t * 0.2 : t);
    gl!.uniform1f(uLevel, level);
    gl!.uniform3f(uBands, bands[0], bands[1], bands[2]);
    gl!.uniform1f(uSpin, spin);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(frame);
  }
  frame(performance.now()); // paint immediately, then keep animating

  return {
    update(next) {
      const sizeChanged = next.size != null && next.size !== o.size;
      Object.assign(o, next);
      if (sizeChanged) resize();
      syncStream();
    },
    destroy() {
      cancelAnimationFrame(raf);
      analyser?.close();
      analyser = null;
      // free GPU objects but keep the context: React StrictMode remounts onto the same canvas
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    },
  };
}
