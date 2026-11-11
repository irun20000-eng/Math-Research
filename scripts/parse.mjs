// 주차 문서(Google Docs를 Markdown으로 내보낸 것) 한 개를 갤러리 데이터로 바꾼다.
// 브라우저와 Node 양쪽에서 쓸 수 있도록 의존성 없이 작성한다.

const SUBJECTS = [
  ['aimath', /인공지능\s*수학/],
  ['calc', /미적분/],
  ['math2', /수학\s*(Ⅱ|II|2)/],
  ['math1', /수학\s*(Ⅰ|I|1)/],
];

const THEMES = [
  ['ai', /AI|인공지능|LLM|딥러닝|신경망|머신러닝|반도체|NPU|GPU|어텐션|강화학습|트랜스포머|임베딩|디퓨전|GAA|추천/],
  ['mobility', /자율주행|차량|자동차|전기차|EV\b|모빌리티|로봇|휴머노이드|철도|열차|하이퍼루프|UAM|eVTOL|드론|라이다/],
  ['aerospace', /우주|위성|로켓|발사체|망원경|항공|재진입|궤도/],
  ['energy', /배터리|전고체|이차전지|풍력|태양광|핵융합|수소|에너지|전력|그리드|연료전지|기후|탄소/],
  ['quantum', /양자|큐비트/],
  ['bio', /의료|바이오|MRI|CT\b|약물|혈관|혈중|세포|단백질|백신|전염병|유전|신약|뇌|헬스|효소|항암/],
  ['fin', /금융|주가|핀테크|블록체인|암호|자산|퀀트|보험/],
];

// 사례가 다루는 함수 유형. 단원명에서 먼저 찾고, 없으면 본문 전체에서 찾는다.
const VISUALS = [
  ['damped', /감쇠\s*진동|링잉/],
  ['sequence', /수열|점화식|급수/],
  ['sine', /삼각함수|푸리에|파동|위상|진동/],
  ['junction', /극한|연속/],
  ['area', /정적분|적분/],
  ['scurve', /5차|7차|궤적|저크|스플라인|S-curve/i],
  ['saturation', /로지스틱|시그모이드|포화|활성화/],
  ['matrix', /행렬|벡터|내적|SVD|경사하강|최적화/],
  ['loglin', /로그/],
  ['expdecay', /지수.*(감쇠|붕괴)|반감기/],
  ['expgrow', /지수/],
  ['extremum', /극값|극대|극소|도함수|미분|변화율/],
];
const VISUAL_FALLBACK = { math1: 'expgrow', math2: 'extremum', calc: 'damped', aimath: 'matrix' };

// Google의 Markdown 내보내기는 문장부호 앞에 역슬래시를 붙인다. `\\frac` → `\frac`.
export function unescapeMd(s) {
  return s.replace(/\\([!-\/:-@\[-`{-~])/g, '$1');
}

const strip = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();
const firstMatch = (rules, text) => { for (const [k, re] of rules) if (re.test(text)) return k; return null; };

function classifyVisual(c) {
  const all = c.title + ' ' + c.points.join(' ');
  if (/감쇠\s*진동|링잉/.test(all)) return 'damped';
  if (/(5차|7차).*다항|저크/.test(all) && c.subject !== 'aimath') return 'scurve';
  return firstMatch(VISUALS, c.unit) || firstMatch(VISUALS, all) || VISUAL_FALLBACK[c.subject];
}

export function firstFormula(points) {
  let best = '';
  for (const p of points) {
    for (const m of p.matchAll(/\$\$([^$]+)\$\$|\$([^$]+)\$/g)) {
      const f = (m[1] || m[2]).trim();
      if (f.length >= 12 && f.includes('=')) return f;
      if (f.length > best.length) best = f;
    }
  }
  return best;
}

export function parseWeek(raw) {
  const idMatch = raw.match(/<!-- id:([\w-]+) -->/);
  const text = unescapeMd(raw).replace(/\r/g, '').replace(/[ \t]+$/gm, '');
  const lines = text.split('\n');
  const date = (text.match(/created:\s*(\d{4}-\d{2}-\d{2})/) || [])[1];
  const week = {
    date, docId: idMatch ? idMatch[1] : '',
    insights: [], cases: [], topics: [], examTrends: '', references: [],
  };
  const dkey = (date || '').replace(/-/g, '');

  let section = null; // insight | cases | topics | exam | refs
  let subject = null, cur = null, topic = null, mode = null;
  const exam = [];
  const counts = {};

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)/);
    if (h2 && !line.startsWith('###')) {
      const t = h2[1];
      cur = null; topic = null;
      if (/Summary|인사이트/.test(t)) section = 'insight';
      else if (/^1\./.test(t)) section = 'cases';
      else if (/^2\./.test(t)) section = 'topics';
      else if (/^3\./.test(t)) { section = 'exam'; week.examTitle = t.replace(/^3\.\s*/, '').replace(/^[^\w가-힣]+/, '').trim(); }
      else if (/참고/.test(t)) section = 'refs';
      else section = null;
      continue;
    }
    if (/^---\s*$/.test(line)) continue;

    if (section === 'insight') {
      const m = line.match(/^-\s+(.*)/);
      if (m) {
        const b = m[1].match(/^\*\*(.+?)\*\*\s*:?\s*(.*)$/);
        week.insights.push(b ? { title: strip(b[1]), text: b[2].trim() } : { title: '', text: m[1].trim() });
      }
    } else if (section === 'cases') {
      const h3 = line.match(/^###\s+(.*)/);
      if (h3) { subject = firstMatch(SUBJECTS, h3[1]) || 'math1'; cur = null; continue; }
      const top = line.match(/^-\s+(.*)/);
      const sub = line.match(/^\s{2,}-\s+(.*)/);
      if (top && subject) {
        const title = strip(top[1]).replace(/:$/, '').trim();
        const parts = title.split(/\s+&\s+/);
        counts[subject] = (counts[subject] || 0) + 1;
        cur = {
          id: `c${dkey}-${subject}-${counts[subject]}`,
          week: date, subject, title,
          unit: parts.length > 1 ? parts[0] : '',
          tech: parts.length > 1 ? parts.slice(1).join(' & ') : title,
          points: [],
        };
        week.cases.push(cur);
      } else if (sub && cur) {
        cur.points.push(sub[1].trim());
      } else if (cur && line.trim() && cur.points.length) {
        cur.points[cur.points.length - 1] += ' ' + line.trim();
      }
    } else if (section === 'topics') {
      const h3 = line.match(/^###\s+(.*)/);
      if (h3) {
        topic = { id: `t${dkey}-${week.topics.length + 1}`, week: date, title: h3[1].replace(/^\[주제\s*\d+\]\s*/, '').trim(), subjects: '', goal: '', steps: [] };
        week.topics.push(topic); mode = null; continue;
      }
      if (!topic) continue;
      const b = line.match(/^\s*-\s+\*\*(.+?)\*\*\s*:?\s*(.*)$/);
      const n = line.match(/^\s*\d+\.\s+(.*)/);
      if (b && /연계/.test(b[1])) { topic.subjects = strip(b[2]); mode = null; }
      else if (b && /목표/.test(b[1])) { topic.goal = b[2].trim(); mode = 'goal'; }
      else if (b && /활동/.test(b[1])) { mode = 'steps'; if (b[2].trim()) topic.steps.push(b[2].trim()); }
      else if (n && mode === 'steps') topic.steps.push(n[1].trim());
      else if (line.trim() && !/^<!--/.test(line.trim())) {
        if (mode === 'steps' && topic.steps.length) topic.steps[topic.steps.length - 1] += ' ' + line.trim();
        else if (mode === 'goal') topic.goal += ' ' + line.trim();
      }
    } else if (section === 'exam') {
      if (!/^<!--/.test(line.trim())) exam.push(line);
    } else if (section === 'refs') {
      const m = line.match(/\[(.+?)\]\((https?:[^)\s]+)\)/);
      if (m) week.references.push({ title: m[1].trim(), url: m[2] });
    }
  }

  week.examTrends = exam.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  for (const c of week.cases) {
    const all = c.title + ' ' + c.points.join(' ');
    c.themes = THEMES.filter(([, re]) => re.test(all)).map(([k]) => k);
    c.visual = classifyVisual(c);
    c.formula = firstFormula(c.points);
  }
  week.focus = week.insights.length ? week.insights[0].title : '';
  return week;
}
