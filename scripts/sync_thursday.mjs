#!/usr/bin/env node
/**
 * scripts/sync_thursday.mjs
 *
 * 매주 목요일 아침(또는 수동 실행 시) Google Drive `수학수업_아이디어` 폴더
 * (ID: 12sIE0fL_yMVWLroq6d3NJNo2lV508wfj)에서 최신 수요일 리서치 문서를 확인하고,
 * 교사 연수 웹앱(study/argon.html)과 갤러리용 최신 피드를 갱신합니다.
 *
 * 신규 강좌 생성 기준 (혼합 방식 1 + 2):
 *  1순위: 교사가 갤러리에서 '관심(keep)' 또는 '심화 중(deep)'으로 표시해 둔 사례
 *  2순위: 최신 주차(수요일 문서)의 첫 번째 핵심 인사이트 및 누적 빈도 상위 수학 구조
 *
 * 사용법:
 *   node scripts/sync_thursday.mjs [--marks path/to/marks.json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseWeek } from './parse.mjs';

const DRIVE_FOLDER_ID = '12sIE0fL_yMVWLroq6d3NJNo2lV508wfj';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE_MD_DIR = path.join(ROOT, '.cache', 'drive-md');
const CACHE_JSON_DIR = path.join(ROOT, '.cache', 'weeks-json');
const FEED_OUT = path.join(ROOT, 'study', 'feed.json');

fs.mkdirSync(CACHE_MD_DIR, { recursive: true });
fs.mkdirSync(CACHE_JSON_DIR, { recursive: true });

/**
 * Find a working gdrive CLI binary in the environment.
 */
function resolveGdriveBin() {
  const pluginBinDir = '/home/antigravity/.gemini/jetski/plugin_data/gdrive/bin';
  if (fs.existsSync(pluginBinDir)) {
    const bins = fs.readdirSync(pluginBinDir).filter((f) => f.startsWith('.gdrive')).sort();
    if (bins.length) return path.join(pluginBinDir, bins[bins.length - 1]);
  }
  return 'gdrive';
}

const GDRIVE_BIN = resolveGdriveBin();

function runGdrive(args) {
  return execFileSync(GDRIVE_BIN, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  });
}

const VISUAL_META = {
  scurve:     { title: '5차·7차 다항 S-커브 궤적과 저크', subj: '수학Ⅱ · 미적분', formula: 'y(τ) = W(10τ³ − 15τ⁴ + 6τ⁵)' },
  loglin:     { title: '지수 모델의 로그 선형화와 반감기', subj: '수학Ⅰ · 미적분', formula: 'ln y(t) = ln A₀ − kt' },
  sine:       { title: '삼각함수 합성과 파동 상쇄 간섭', subj: '수학Ⅰ · 미적분', formula: 'y₁ + y₂ = 2A cos(φ/2) sin(ωt + φ/2)' },
  damped:     { title: '감쇠 진동과 오버슈트 제어', subj: '미적분 · 기하', formula: 'x(t) = A₀ e^(−αt) cos(ωt)' },
  saturation: { title: '로지스틱 포화 곡선과 S자 성장 한계', subj: '미적분 · 인공지능 수학', formula: 'f(t) = L / (1 + e^(−k(t − t₀)))' },
  matrix:     { title: '벡터 내적·코사인 유사도와 행렬 최적화', subj: '인공지능 수학 · 기하', formula: 'cos θ = (u · v) / (‖u‖ ‖v‖)' },
  extremum:   { title: '도함수 극값과 최적 설계 조건', subj: '수학Ⅱ · 미적분', formula: 'f′(x*) = 0, f″(x*) ≷ 0' },
  area:       { title: '정적분 누적량과 에너지 수지 분석', subj: '수학Ⅱ · 미적분', formula: 'E(T) = ∫₀ᵀ P(t) dt' },
  junction:   { title: '구간별 함수의 연속성과 미분가능 접합', subj: '수학Ⅱ · 미적분', formula: 'f₁(a) = f₂(a), f₁′(a) = f₂′(a)' },
  sequence:   { title: '점화식과 등비급수 수렴 분석', subj: '수학Ⅰ · 미적분', formula: 'aₙ₊₁ = r aₙ + d' },
  expdecay:   { title: '지수 감쇠와 시정수·반감기 모델', subj: '수학Ⅰ · 미적분', formula: 'y(t) = y₀ e^(−t/τ)' },
  expgrow:    { title: '지수 성장과 임계 돌파 시점', subj: '수학Ⅰ · 미적분', formula: 'y(t) = y₀ e^(kt)' },
};

function loadMarks() {
  const idx = process.argv.indexOf('--marks');
  if (idx !== -1 && process.argv[idx + 1] && fs.existsSync(process.argv[idx + 1])) {
    try { return JSON.parse(fs.readFileSync(process.argv[idx + 1], 'utf8')); } catch (e) {}
  }
  const defaultMarks = path.join(ROOT, '.cache', 'marks.json');
  if (fs.existsSync(defaultMarks)) {
    try { return JSON.parse(fs.readFileSync(defaultMarks, 'utf8')); } catch (e) {}
  }
  return {};
}

function syncFromDrive() {
  console.log(`[1/4] Google Drive 폴더(${DRIVE_FOLDER_ID}) 스캔 중...`);
  let items = [];
  try {
    const raw = runGdrive(['readonly', 'ls', DRIVE_FOLDER_ID, '--max', '50', '--json']);
    const parsed = JSON.parse(raw);
    items = Array.isArray(parsed) ? parsed : (parsed.files || parsed.items || []);
  } catch (err) {
    console.warn('  ⚠ Drive 실시간 목록 조회 실패 (캐시된 Markdown 문서를 사용합니다):', err.message.split('\n')[0]);
  }

  let downloaded = 0;
  for (const item of items) {
    const name = item.name || item.title || '';
    const m = name.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) continue;
    const date = m.group ? m.group[1] : m[1];
    const mdPath = path.join(CACHE_MD_DIR, `${date}.md`);
    if (fs.existsSync(mdPath)) continue;

    const tmpOut = path.join(CACHE_MD_DIR, `.tmp-${date}.md`);
    try {
      runGdrive(['readonly', 'export', item.id, tmpOut, '--format', 'md']);
      const body = fs.readFileSync(tmpOut, 'utf8');
      fs.writeFileSync(mdPath, `<!-- id:${item.id} -->\n${body}`, 'utf8');
      fs.unlinkSync(tmpOut);
      downloaded++;
      console.log(`  ✓ 신규 수요일 문서 내려받기 완료: ${date} (${item.id})`);
    } catch (e) {
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
      console.warn(`  ⚠ 문서 내보내기 실패 (${date}):`, e.message.split('\n')[0]);
    }
  }
  return downloaded;
}

function buildFeed() {
  const downloaded = syncFromDrive();
  const mdFiles = fs.readdirSync(CACHE_MD_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();

  console.log(`[2/4] 주차 문서 파싱 및 수식 분류 중 (총 ${mdFiles.length}개 문서)...`);
  const weeks = [];
  for (const f of mdFiles) {
    const raw = fs.readFileSync(path.join(CACHE_MD_DIR, f), 'utf8');
    const w = parseWeek(raw);
    if (w && w.date) {
      weeks.push(w);
      fs.writeFileSync(path.join(CACHE_JSON_DIR, `${w.date}.json`), JSON.stringify(w, null, 2));
    }
  }
  weeks.sort((a, b) => (a.date < b.date ? 1 : -1));

  const marks = loadMarks();
  const allCases = weeks.flatMap((w) => w.cases.map((c) => ({ ...c, docId: w.docId })));

  // Group cases by mathematical visual structure
  const byVisual = {};
  for (const c of allCases) {
    byVisual[c.visual] = byVisual[c.visual] || [];
    byVisual[c.visual].push({
      id: c.id,
      week: c.week,
      subject: c.subject,
      unit: c.unit,
      tech: c.tech,
      formula: c.formula,
      status: (marks[c.id] && marks[c.id].status) || 'new',
    });
  }

  // Hybrid Course Generation Queue (방식 1: 주간 최신 핵심 인사이트 + 방식 2: 교사 keep/deep 표시 사례)
  console.log('[3/4] 신규 연수 강좌 후보 선정 (1+2 혼합 방식)...');
  const teacherPicked = allCases.filter((c) => {
    const st = marks[c.id] && marks[c.id].status;
    return st === 'keep' || st === 'deep';
  });

  const latestWeek = weeks[0] || null;
  const autoCandidates = [];

  // 1순위: 교사가 별도 표시(keep/deep)해 둔 사례 기반 강좌 후보
  for (const c of teacherPicked) {
    const meta = VISUAL_META[c.visual] || VISUAL_META.extremum;
    autoCandidates.push({
      source: 'teacher_keep',
      badge: '교사 관심 지정 1순위',
      caseId: c.id,
      week: c.week,
      visual: c.visual,
      courseTitle: `${meta.title} — ${c.tech}`,
      subj: meta.subj,
      formula: c.formula || meta.formula,
      relatedCount: (byVisual[c.visual] || []).length,
    });
  }

  // 2순위: 최신 수요일 문서의 첫 번째 핵심 인사이트 & 미개설 고빈도 수학 구조
  if (latestWeek) {
    const topCase = latestWeek.cases[0];
    if (topCase) {
      const meta = VISUAL_META[topCase.visual] || VISUAL_META.extremum;
      autoCandidates.push({
        source: 'weekly_auto',
        badge: `${latestWeek.date} 수요일 문서 자동 추천`,
        caseId: topCase.id,
        week: latestWeek.date,
        visual: topCase.visual,
        courseTitle: `${meta.title} (${latestWeek.focus || topCase.tech})`,
        subj: meta.subj,
        formula: topCase.formula || meta.formula,
        relatedCount: (byVisual[topCase.visual] || []).length,
      });
    }
  }

  // 미개설 고빈도 구조 추가 추천
  const openedVisuals = new Set(['scurve', 'loglin', 'sine', 'damped']);
  Object.entries(byVisual)
    .filter(([v]) => !openedVisuals.has(v))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .forEach(([v, list]) => {
      const meta = VISUAL_META[v] || VISUAL_META.extremum;
      autoCandidates.push({
        source: 'accumulated_structure',
        badge: `누적 ${list.length}개 사례 도달 · 자동 생성 후보`,
        caseId: list[0].id,
        week: list[0].week,
        visual: v,
        courseTitle: meta.title,
        subj: meta.subj,
        formula: list[0].formula || meta.formula,
        relatedCount: list.length,
      });
    });

  const feed = {
    syncedAt: new Date().toISOString(),
    driveFolderId: DRIVE_FOLDER_ID,
    downloadedNewDocs: downloaded,
    totalWeeks: weeks.length,
    totalCases: allCases.length,
    latestWeekDate: latestWeek ? latestWeek.date : '2026-11-11',
    latestWeekFocus: latestWeek ? latestWeek.focus : '자율주행 긴급 회피와 타이어 마찰원 수리 모델',
    byVisual,
    nextCourseQueue: autoCandidates,
  };

  fs.writeFileSync(FEED_OUT, JSON.stringify(feed, null, 2), 'utf8');
  const seedOut = path.join(ROOT, 'site', 'seed.json');
  fs.writeFileSync(seedOut, JSON.stringify(weeks), 'utf8');
  console.log(`[4/4] 동기화 완료! study/feed.json 및 site/seed.json 갱신됨 (주차 ${feed.totalWeeks}개, 사례 ${feed.totalCases}개, 차기 강좌 후보 ${autoCandidates.length}건)`);
}

buildFeed();
