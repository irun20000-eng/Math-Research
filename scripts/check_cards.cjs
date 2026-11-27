// 학습 카드 Markdown 파일을 검사하고 데이터베이스에 넣을 JSON 으로 포장한다.
// 사용법: node scripts/check_cards.cjs <카드 .md 폴더> <출력 JSON 폴더>
//   파일 이름은 <사례ID>.md. 통과한 카드만 <출력>/<사례ID>.json 으로 쓴다.
// 검사: 절 제목 8개가 순서대로 있는지, 수식이 모두 그려지는지, 표·다른 수준의 제목이 없는지, 분량.
const fs = require('node:fs');
const path = require('node:path');
const katex = require('katex');

// 세 번째 인자로 2차 검토 결과 폴더를 주면(그 안의 *.json 은 [{id, verdict, note}] 배열) 카드에 review 로 붙인다.
const [src, out, reviewDir] = process.argv.slice(2);
if (!src || !out) { console.error('usage: check_cards.cjs <md dir> <json dir> [review dir]'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const reviews = {};
if (reviewDir) for (const f of fs.readdirSync(reviewDir).filter((n) => n.endsWith('.json'))) {
  for (const r of JSON.parse(fs.readFileSync(path.join(reviewDir, f), 'utf8'))) {
    if (r && r.id && ['ok', 'fixed', 'unsure'].includes(r.verdict)) reviews[r.id] = { verdict: r.verdict, note: String(r.note || '').slice(0, 300), at: new Date().toISOString().slice(0, 10) };
  }
}

const { compileExpr } = require('./expr.cjs');
const str = (v, max, name) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(name + ' 없음 또는 ' + max + '자 초과'); return v.trim(); };
const pair = (v, name) => { if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite) || !(v[0] < v[1])) throw new Error(name + ' 범위 오류'); return [v[0], v[1]]; };
function checkFig(f) {
  const out = { key: str(f.key, 300, 'key'), say: str(f.say, 90, 'say') };
  katex.renderToString(out.key, { throwOnError: true, displayMode: true, output: 'mathml' });
  if (f.plot == null) return out;
  const p = f.plot, x = pair(p.x, 'x'), y = pair(p.y, 'y');
  if (!Array.isArray(p.curves) || p.curves.length < 1 || p.curves.length > 3) throw new Error('curves 는 1~3개');
  const curves = p.curves.map((c) => {
    const expr = str(c.expr, 200, 'expr'), fn = compileExpr(expr); let fin = 0, inside = 0;
    for (let i = 0; i <= 200; i++) { const v = fn(x[0] + (x[1] - x[0]) * i / 200); if (Number.isFinite(v)) { fin++; if (v >= y[0] && v <= y[1]) inside++; } }
    if (fin < 140) throw new Error('값이 정의되지 않는 구간이 많음: ' + expr);
    if (inside < 60) throw new Error('세로 범위를 벗어남: ' + expr);
    return { label: str(c.label, 16, 'label'), expr };
  });
  const plot = { xLabel: str(p.xLabel, 30, 'xLabel'), yLabel: str(p.yLabel, 30, 'yLabel'), x, y, curves };
  if (Number.isFinite(p.start) && p.start >= x[0] && p.start <= x[1]) plot.start = p.start;
  if (Array.isArray(p.marks)) plot.marks = p.marks.slice(0, 2).filter((m) => m && Number.isFinite(m.x) && m.x >= x[0] && m.x <= x[1]).map((m) => ({ x: m.x, label: str(m.label, 14, 'mark label') }));
  if (p.note) plot.note = str(p.note, 120, 'note');
  return { ...out, plot };
}
const SECTIONS =['한눈에', '쉬운 설명', '용어 풀이', '수식 한 줄씩', '문답', '확인 문제', '다음 공부', '원본에서 고친 점'];
let bad = 0, ok = 0;
const batch = [];
for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.md')).sort()) {
  const id = f.replace(/\.md$/, '');
  const text = fs.readFileSync(path.join(src, f), 'utf8').replace(/\r/g, '').trim();
  const problems = [];
  const heads = [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  if (heads.join('|') !== SECTIONS.join('|')) problems.push('절 구성 다름: ' + heads.join(', '));
  if (/^(#|#{3,})\s/m.test(text)) problems.push('다른 수준의 제목');
  if (/^\s*\|.*\|\s*$/m.test(text)) problems.push('표 사용');
  if ((text.match(/\$\$/g) || []).length % 2) problems.push('$$ 짝이 안 맞음');
  let mathBad = 0, mathN = 0;
  const body = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => { mathN++; try { katex.renderToString(t, { throwOnError: true, displayMode: true, output: 'mathml' }); } catch (e) { mathBad++; problems.push('수식 오류: ' + t.slice(0, 40)); } return ' '; });
  for (const m of body.matchAll(/\$([^$\n]+)\$/g)) { mathN++; try { katex.renderToString(m[1], { throwOnError: true, output: 'mathml' }); } catch (e) { mathBad++; problems.push('수식 오류: ' + m[1].slice(0, 40)); } }
  if ((body.replace(/\$[^$\n]+\$/g, '').match(/\$/g) || []).length) problems.push('짝 없는 $');
  if ((text.match(/\*\*Q\.\*\*/g) || []).length < 4) problems.push('문답 4개 미만');
  if ((text.match(/\*\*정답과 풀이\*\*/g) || []).length < 3) problems.push('확인 문제 3개 미만');
  if (text.length < 1400) problems.push('분량 부족 ' + text.length);
  if (text.length > 6000) problems.push('분량 과다 ' + text.length);
  if (problems.length) { bad++; console.log('✗', id, '|', problems.slice(0, 4).join(' ; ')); continue; }
  ok++;
  const file = path.join(out, id + '.json');
  // 같은 폴더에 <사례ID>.fig.json 이 있으면 핵심 수식과 그래프 정보를 검사해 fig 로 붙인다. 틀린 fig 는 빼고 카드만 넣는다.
  let fig = null; const figFile = path.join(src, id + '.fig.json');
  if (fs.existsSync(figFile)) { try { fig = checkFig(JSON.parse(fs.readFileSync(figFile, 'utf8'))); } catch (e) { console.log('  (fig 제외)', id, '|', e.message); } }
  const doc = { caseId: id, text, at: Date.now(), checked: false, auto: true };
  if (fig) doc.fig = fig;
  if (reviewDir && !reviews[id]) console.log('  (2차 검토 결과 없음)', id);
  if (reviews[id]) doc.review = reviews[id];
  fs.writeFileSync(file, JSON.stringify(doc));
  batch.push({ op: 'set', collection: 'cards', doc_id: id, file_path: path.resolve(file) });
  console.log('✓', id, text.length + '자', '수식 ' + mathN);
}
fs.writeFileSync(path.join(out, '_batch.json'), JSON.stringify(batch));
console.log(`통과 ${ok}, 실패 ${bad}`);
process.exit(bad ? 1 : 0);
