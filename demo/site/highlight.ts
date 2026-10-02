// A tiny TSX highlighter for the code samples: comments, strings, keywords,
// JSX tags, props and numbers. Returns tokens; rendering stays in React (no innerHTML).

export type TokenKind = 'plain' | 'comment' | 'string' | 'keyword' | 'tag' | 'attr' | 'number' | 'punct';
export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  'import', 'from', 'export', 'const', 'let', 'var', 'function', 'return', 'async', 'await', 'new', 'if', 'else',
  'true', 'false', 'null', 'undefined', 'type', 'interface', 'default', 'typeof', 'for', 'of', 'in',
]);

const RULES: Array<[TokenKind, RegExp]> = [
  ['comment', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
  ['string', /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/y],
  ['tag', /<\/?[A-Za-z][\w.]*|\/?>/y],
  ['attr', /[A-Za-z_$][\w$]*(?==[{'"])/y],
  ['number', /\b\d+(?:\.\d+)?\b/y],
  ['plain', /[A-Za-z_$][\w$]*/y],
  ['punct', /[{}()[\];,.:=?+\-*!&|]/y],
  ['plain', /\s+|./y],
];

export function highlight(code: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < code.length) {
    for (const [kind, re] of RULES) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (!m || !m[0]) continue;
      const k = kind === 'plain' && KEYWORDS.has(m[0]) ? 'keyword' : kind;
      const last = out[out.length - 1];
      if (last && last.kind === k && k === 'plain') last.text += m[0];
      else out.push({ kind: k, text: m[0] });
      i += m[0].length;
      break;
    }
  }
  return out;
}
