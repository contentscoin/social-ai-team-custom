// 캘린더 날짜 해석 — week/day 텍스트 또는 scheduledDate → 실제 YYYY-MM-DD
const fs = require('fs');
const path = require('path');

const DAY_MAP = {
  mon: 1, monday: 1, 월: 1, 월요일: 1,
  tue: 2, tuesday: 2, 화: 2, 화요일: 2,
  wed: 3, wednesday: 3, 수: 3, 수요일: 3,
  thu: 4, thursday: 4, 목: 4, 목요일: 4,
  fri: 5, friday: 5, 금: 5, 금요일: 5,
  sat: 6, saturday: 6, 토: 6, 토요일: 6,
  sun: 0, sunday: 0, 일: 0, 일요일: 0,
};

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function loadCalendarMeta(dir) {
  const j = readJson(path.join(dir, 'context', 'calendar-meta.json'));
  const now = new Date();
  const year = Number(j && j.year) || now.getFullYear();
  const month = Number(j && j.month) || (now.getMonth() + 1);
  const weekStartsOn = (j && j.weekStartsOn) === 'sunday' ? 0 : 1; // 기본 월요일 시작
  let anchor = j && j.anchor;
  if (!anchor) anchor = `${year}-${String(month).padStart(2, '0')}-01`;
  return { year, month, anchor, weekStartsOn };
}

function parseDayToken(day) {
  const d = String(day || '').trim().toLowerCase();
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{1,2}$/.test(d)) return Number(d);
  const key = Object.keys(DAY_MAP).find((k) => d.startsWith(k) || d === k);
  return key != null ? DAY_MAP[key] : null;
}

function resolvePostDate(post, meta) {
  if (post.scheduledDate && /^\d{4}-\d{2}-\d{2}$/.test(post.scheduledDate)) {
    return post.scheduledDate;
  }
  const { year, month, anchor } = meta;
  const anchorDate = new Date(`${anchor}T12:00:00`);
  if (Number.isNaN(anchorDate.getTime())) return null;

  const dayTok = parseDayToken(post.day);
  const weekNum = parseInt(String(post.week || '1').replace(/^W/i, ''), 10) || 1;

  if (typeof dayTok === 'string') return dayTok;
  if (typeof dayTok === 'number' && dayTok >= 1 && dayTok <= 31) {
    const m = String(month).padStart(2, '0');
    const dd = String(dayTok).padStart(2, '0');
    return `${year}-${m}-${dd}`;
  }
  if (typeof dayTok === 'number') {
    // week N + 요일 → anchor 기준 주차 오프셋
    const startDow = anchorDate.getDay();
    const weekOffset = (weekNum - 1) * 7;
    let delta = dayTok - startDow;
    if (delta < 0) delta += 7;
    const d = new Date(anchorDate);
    d.setDate(d.getDate() + weekOffset + delta);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/** @returns {{ year: number, month: number, cells: Array<{ date: string|null, inMonth: boolean, dow: number }> }} */
function monthGrid(year, month, weekStartsOn = 1) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const startPad = (first.getDay() - weekStartsOn + 7) % 7;
  const cells = [];
  const start = new Date(first);
  start.setDate(start.getDate() - startPad);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    cells.push({
      date: iso,
      inMonth: d.getMonth() === month - 1,
      dow: d.getDay(),
      dayNum: d.getDate(),
    });
  }
  return { year, month, lastDay: last.getDate(), cells };
}

function groupPostsByDate(posts, meta) {
  const byDate = new Map();
  for (const p of posts) {
    const date = resolvePostDate(p, meta) || 'unscheduled';
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(p);
  }
  for (const arr of byDate.values()) {
    arr.sort((a, b) => String(a.scheduledTime || '').localeCompare(String(b.scheduledTime || '')) || a.n - b.n);
  }
  return byDate;
}

function enrichPostsWithDates(posts, dir) {
  const meta = loadCalendarMeta(dir);
  return posts.map((p) => ({
    ...p,
    scheduledDate: resolvePostDate(p, meta),
    scheduledTime: p.scheduledTime || p.time || null,
  }));
}

module.exports = {
  loadCalendarMeta,
  resolvePostDate,
  monthGrid,
  groupPostsByDate,
  enrichPostsWithDates,
  DAY_MAP,
};
