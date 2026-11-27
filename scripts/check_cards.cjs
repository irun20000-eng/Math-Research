// 학습 카드 Markdown 파일을 검사하고 데이터베이스에 넣을 JSON 으로 포장한다.
// 사용법: node scripts/check_cards.cjs <카드 .md 폴더> <출력 JSON 폴더>
//   파일 이름은 <사례ID>.md. 통과한 카드만 <출력>/<사례ID>.json 으로 쓴다.
// 검사: 절 제목 8개가 순서대로 있는지, 수식이 모두 그려지는지, 표·다른 수준의 제목이 없는지, 분량.
const fs = require('node:fs');
const path = require('node:path');
const katex = require('katex');

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: check_cards.cjs <md dir> <json dir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const SECTIONS = ['한눈에', '쉬운 설명', '용어 풀이', '수식 한 줄씩', '문답', '확인 문제', '다음 공부', '원본에서 고친 점'];
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
  fs.writeFileSync(file, JSON.stringify({ caseId: id, text, at: Date.now(), checked: false, auto: true }));
  batch.push({ op: 'set', collection: 'cards', doc_id: id, file_path: path.resolve(file) });
  console.log('✓', id, text.length + '자', '수식 ' + mathN);
}
fs.writeFileSync(path.join(out, '_batch.json'), JSON.stringify(batch));
console.log(`통과 ${ok}, 실패 ${bad}`);
process.exit(bad ? 1 : 0);
