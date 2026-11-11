// 사용법: node scripts/build.mjs <Markdown 폴더> <출력 폴더>
// 주차 문서마다 <출력 폴더>/<날짜>.json 을 만들고, 빠진 항목이 있으면 실패한다.
import fs from 'node:fs';
import path from 'node:path';
import { parseWeek } from './parse.mjs';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: build.mjs <src> <out>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

let bad = 0;
const tally = { visual: {}, theme: {}, subject: {} };
for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.md')).sort()) {
  const w = parseWeek(fs.readFileSync(path.join(src, f), 'utf8'));
  const noPoints = w.cases.filter((c) => !c.points.length).length;
  const noFormula = w.cases.filter((c) => !c.formula).length;
  const noSteps = w.topics.filter((t) => !t.steps.length || !t.goal).length;
  const problems = [];
  if (!w.date) problems.push('날짜 없음');
  if (!w.docId) problems.push('문서 ID 없음');
  if (w.insights.length < 2) problems.push('인사이트 부족');
  if (w.cases.length < 8) problems.push('사례 부족');
  if (noPoints) problems.push(`내용 없는 사례 ${noPoints}`);
  if (w.topics.length !== 4) problems.push(`세특 주제 ${w.topics.length}개`);
  if (noSteps) problems.push(`목표·활동 없는 주제 ${noSteps}`);
  if (!w.examTrends) problems.push('출제 경향 없음');
  if (!w.references.length) problems.push('참고 링크 없음');
  for (const c of w.cases) {
    tally.visual[c.visual] = (tally.visual[c.visual] || 0) + 1;
    tally.subject[c.subject] = (tally.subject[c.subject] || 0) + 1;
    for (const t of c.themes) tally.theme[t] = (tally.theme[t] || 0) + 1;
    if (!c.themes.length) tally.theme['(없음)'] = (tally.theme['(없음)'] || 0) + 1;
  }
  console.log(`${w.date}  사례 ${w.cases.length} (수식 없음 ${noFormula})  주제 ${w.topics.length}  링크 ${w.references.length}  ${problems.length ? '⚠ ' + problems.join(', ') : 'ok'}`);
  if (problems.length) bad++;
  fs.writeFileSync(path.join(out, `${w.date}.json`), JSON.stringify(w));
}
console.log(JSON.stringify(tally));
process.exit(bad ? 1 : 0);
