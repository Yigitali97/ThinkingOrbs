// A tiny local "brain" so the voice assistant sample works with no backend.
// Swap it for a real model: any (text, signal) => Promise<Reply> works.

export type Reply = string | { text: string; /** end the conversation after speaking */ end?: boolean };

const JOKES = [
  "Why did the neural network go to therapy? It had too many unresolved layers.",
  "I would tell you a UDP joke, but you might not get it.",
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "There are 10 kinds of people: those who understand binary, and those who don't.",
];

const OPS: Record<string, (a: number, b: number) => number> = {
  plus: (a, b) => a + b,
  '+': (a, b) => a + b,
  minus: (a, b) => a - b,
  '-': (a, b) => a - b,
  times: (a, b) => a * b,
  x: (a, b) => a * b,
  '*': (a, b) => a * b,
  'multiplied by': (a, b) => a * b,
  'divided by': (a, b) => a / b,
  over: (a, b) => a / b,
  '/': (a, b) => a / b,
};

const SPOKEN: Record<string, string> = { '+': 'plus', '-': 'minus', '*': 'times', x: 'times', '/': 'divided by', 'multiplied by': 'times', over: 'divided by' };

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

const say = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

export async function localBrain(text: string, signal: AbortSignal): Promise<Reply> {
  await sleep(500 + Math.random() * 700, signal); // "thinking"
  const t = text.toLowerCase().trim();

  const math = t.match(/(-?\d+(?:\.\d+)?)\s*(plus|\+|minus|-|times|x|\*|multiplied by|divided by|over|\/)\s*(-?\d+(?:\.\d+)?)/);
  if (math) {
    const a = Number(math[1]), b = Number(math[3]);
    const r = OPS[math[2]](a, b);
    const word = SPOKEN[math[2]] ?? math[2];
    return isFinite(r) ? `${say(a)} ${word} ${say(b)} is ${say(r)}.` : "I can't divide by zero.";
  }
  if (/\b(bye|goodbye|see you|that's all|stop listening)\b/.test(t)) return { text: 'Goodbye! Tap the orb whenever you need me.', end: true };
  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t))
    return "Hi! I'm a demo voice assistant. Ask me the time, today's date, a quick sum, or for a joke.";
  if (/\btime\b/.test(t)) return `It's ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  if (/\b(date|day is it|today)\b/.test(t))
    return `Today is ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.`;
  if (/\bjoke\b/.test(t)) return JOKES[Math.floor(Math.random() * JOKES.length)];
  if (/\b(what can you do|help|options)\b/.test(t))
    return 'I can tell you the time and date, do quick sums like twelve times seven, and tell jokes. Say goodbye to end the conversation.';
  if (/\b(your name|who are you)\b/.test(t)) return "I'm the AssistantOrb demo. My orb turns blue when I listen, orange when I think, and green when I talk.";
  if (/\b(thank you|thanks)\b/.test(t)) return "You're welcome!";
  return `You said: "${text}". I'm only a tiny built-in demo brain, so connect a real model through the respond function to answer anything.`;
}
