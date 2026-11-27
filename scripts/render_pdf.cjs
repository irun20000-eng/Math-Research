// 수업 자료(Markdown + LaTeX)를 수식이 그려진 PDF로 만든다.
// 사용법: node scripts/render_pdf.cjs <입력.md> <출력.pdf> --title "제목" --sub "부제" [--layout note|keep]
//   note: 필기용(오른쪽 여백 넓게, 줄 간격 넓게)   keep: 보관용(촘촘하게)
// 준비: 저장소에서 npm install (katex). Chromium과 Playwright는 실행 환경에 설치된 것을 쓴다.
const fs = require('node:fs');
const katex = require('katex');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [input, output] = args;
if (!input || !output) { console.error('usage: render_pdf.cjs <in.md> <out.pdf> [--title t] [--sub s] [--layout note|keep]'); process.exit(2); }
const layout = opt('layout', 'keep'), title = opt('title', ''), sub = opt('sub', '');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let mathErrors = 0;
function tex(src, display) {
  try { return katex.renderToString(src, { output: 'mathml', throwOnError: true, displayMode: !!display }); }
  catch (e) { mathErrors++; return '<code>' + esc(src) + '</code>'; }
}
function inline(s) {
  const out = []; let last = 0; const re = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g; let m;
  const plain = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  while ((m = re.exec(s))) { out.push(plain(s.slice(last, m.index))); out.push(m[1] ? '<div class="mb">' + tex(m[1].trim(), true) + '</div>' : tex(m[2], false)); last = re.lastIndex; }
  out.push(plain(s.slice(last))); return out.join('');
}
function block(md) {
  const disp = [];
  md = String(md || '').replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => { disp.push(t.trim()); return '\n@@D' + (disp.length - 1) + '@@\n'; });
  return md.split('\n').map((line) => {
    if (!line.trim()) return ''; let m;
    if ((m = line.trim().match(/^@@D(\d+)@@$/))) return '<div class="mb">' + tex(disp[+m[1]], true) + '</div>';
    line = line.replace(/@@D(\d+)@@/g, (_, i) => '$$' + disp[+i].replace(/\n/g, ' ') + '$$');
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) return '<hr>';
    if ((m = line.match(/^#{1,2}\s+(.*)/))) return '<h3>' + inline(m[1]) + '</h3>';
    if ((m = line.match(/^#{3,5}\s+(.*)/))) return '<h4>' + inline(m[1]) + '</h4>';
    if (/\(풀이 공간\)/.test(line)) return '<div class="space"></div>';
    if ((m = line.match(/^(\s*)(\d+)[.)]\s+(.*)/))) return '<div class="li num" style="margin-left:' + Math.floor(m[1].length / 2) * 1.1 + 'em"><b>' + m[2] + '.</b> ' + inline(m[3]) + '</div>';
    if ((m = line.match(/^(\s*)[-*]\s+(.*)/))) return '<div class="li" style="margin-left:' + (1 + Math.floor(m[1].length / 2) * 1.1) + 'em">' + inline(m[2]) + '</div>';
    return '<p>' + inline(line.trim()) + '</p>';
  }).join('\n');
}

const note = layout === 'note';
const css = `
@page { size: A4; margin: ${note ? '16mm 62mm 16mm 16mm' : '15mm 17mm'}; }
* { box-sizing: border-box; }
body { margin: 0; color: #111; font: ${note ? '11.5pt/2.0' : '10.5pt/1.7'} "Noto Sans CJK KR", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
h1 { font-size: 15pt; margin: 0 0 3pt; line-height: 1.4; }
.sub { color: #555; font-size: 9pt; margin: 0 0 10pt; padding-bottom: 6pt; border-bottom: 1.2pt solid #111; }
h3 { font-size: 12pt; margin: ${note ? '20pt' : '13pt'} 0 3pt; padding-top: 5pt; border-top: .6pt solid #aaa; break-after: avoid; }
h4 { font-size: 11pt; margin: 8pt 0 2pt; break-after: avoid; }
p { margin: 0 0 ${note ? '7pt' : '4.5pt'}; }
.li { margin: 1.5pt 0; position: relative; } .li::before { content: "·"; position: absolute; left: -0.9em; color: #777; } .li.num::before { content: none; }
.mb { text-align: center; padding: 4pt 0; break-inside: avoid; }
.space { height: 46mm; border: .6pt dashed #bbb; border-radius: 3pt; margin: 4pt 0 8pt; break-inside: avoid; }
hr { border: 0; border-top: .6pt dashed #999; margin: 8pt 0; }
code { font-family: monospace; background: #eee; padding: 0 2pt; }
math { font-size: 1.05em; }
`;

(async () => {
  const body = block(fs.readFileSync(input, 'utf8'));
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css}</style></head><body>${title ? '<h1>' + esc(title) + '</h1>' : ''}${sub ? '<div class="sub">' + esc(sub) + '</div>' : ''}${body}</body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({ path: output, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(JSON.stringify({ output, bytes: fs.statSync(output).size, mathErrors }));
  if (mathErrors) process.exitCode = 3; // 그리지 못한 수식이 있음: 원문 LaTeX를 고친 뒤 다시 실행
})();
