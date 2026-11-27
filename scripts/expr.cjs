// 그래프용 수식 계산기. eval 을 쓰지 않는다. site/index.html 안의 compileExpr 와 같은 내용이어야 한다.
// 문법: 변수 x, 수(1.5, 2.5e6), + - * / ^, 괄호, 함수 sin cos tan exp ln log10 sqrt abs floor round min max, 상수 pi e.
// 곱셈은 반드시 * 로 쓴다(2x 가 아니라 2*x).
function compileExpr(src) {
  const FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, log10: Math.log10, sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, round: Math.round, min: Math.min, max: Math.max };
  const s = String(src).trim(), toks = [], re = /\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?|[a-z][a-z0-9]*|[-+*/^(),])/y;
  while (re.lastIndex < s.length) { const at = re.lastIndex, m = re.exec(s); if (!m) throw new Error('읽을 수 없는 글자: ' + s.slice(at, at + 8)); toks.push(m[1]); }
  let i = 0; const peek = () => toks[i], eat = (t) => { if (toks[i] !== t) throw new Error('"' + t + '" 가 와야 하는 자리: ' + (toks[i] || '끝')); i++; };
  const expr = () => { let a = term(); while (peek() === '+' || peek() === '-') { const op = toks[i++], b = term(), l = a; a = op === '+' ? (x) => l(x) + b(x) : (x) => l(x) - b(x); } return a; };
  const term = () => { let a = unary(); while (peek() === '*' || peek() === '/') { const op = toks[i++], b = unary(), l = a; a = op === '*' ? (x) => l(x) * b(x) : (x) => l(x) / b(x); } return a; };
  const unary = () => { if (peek() === '-') { i++; const a = unary(); return (x) => -a(x); } if (peek() === '+') { i++; return unary(); } return power(); };
  const power = () => { const a = atom(); if (peek() === '^') { i++; const b = unary(); return (x) => Math.pow(a(x), b(x)); } return a; };
  const atom = () => {
    const t = toks[i++]; if (t === undefined) throw new Error('식이 중간에 끝남');
    if (/^\d/.test(t)) { const v = Number(t); return () => v; }
    if (t === '(') { const a = expr(); eat(')'); return a; }
    if (t === 'x') return (x) => x; if (t === 'pi') return () => Math.PI; if (t === 'e') return () => Math.E;
    if (FN[t]) { eat('('); const args = [expr()]; while (peek() === ',') { i++; args.push(expr()); } eat(')'); const f = FN[t]; return (x) => f(...args.map((a) => a(x))); }
    throw new Error('모르는 이름: ' + t);
  };
  const f = expr(); if (i < toks.length) throw new Error('남는 글자: ' + toks[i]); return f;
}
module.exports = { compileExpr };
