// =====================================================
// WEEKLY FC — Google Apps Script Backend v2
// =====================================================

const SHEET_PLAYERS  = '선수명단';
const SHEET_ROTATION = '봉사로테이션';
const SHEET_FINES    = '벌금';
const SHEET_STATLOG  = '능력치기록';

const PLAYER_COLS  = ['num','pos','detail','foot','name','phone','vest','note','pace','dribble','pass','shoot','defend','stamina','rot','avatar'];
const ROT_COLS     = ['year','month','p1','p2','done'];
const FINE_COLS    = ['id','date','match_id','player','type','amount','paid'];
const STATLOG_COLS = ['ts','by','by_name','num','field','before','after'];
const STAT_FIELDS  = ['pace','dribble','pass','shoot','defend','stamina'];
/** 화면에 돌려주는 기록 수. 전부 보내면 시즌이 갈수록 응답이 무거워진다 —
 *  시트엔 다 남고, 화면은 선수별로 몇 줄만 보여 주므로 최근 것만 실어 보낸다. */
const STATLOG_KEEP = 300;

function doGet(e) {
  try {
    const action  = e.parameter.action  || '';
    const pin     = e.parameter.pin     || '';
    const payload = e.parameter.payload ? JSON.parse(decodeURIComponent(e.parameter.payload)) : {};

    let result;

    // 읽기 액션 (PIN 불필요)
    if (action === 'getAll') {
      result = handleGetAll(false);
    } else if (action === 'writeAvatar') {
      // PIN 없이 동작하는 쓰기 그 하나. 아바타 칸 하나만 건드린다 — 아래 핸들러 주석 참고.
      result = handleWriteAvatar(payload);
    } else if (action === 'writeStats') {
      // PIN 없이 동작하는 쓰기 둘. 능력치 여섯 칸만 건드리고 누가 고쳤는지 기록을 남긴다
      // (2026-09-22 사용자 결정: 아무나 아무 선수나 고치되 기록으로 받친다).
      result = handleWriteStats(payload);
    } else if (action === 'verifyPin') {
      verifyPin(pin);
      result = { ok: true };
    } else {
      // 쓰기 액션 — PIN 필요
      verifyPin(pin);
      switch (action) {
        case 'getAllFull':      result = handleGetAll(true);            break;
        case 'writePlayer':    result = handleWritePlayer(payload);    break;
        case 'deletePlayer':   result = handleDeletePlayer(payload);   break;
        case 'writeRotation':  result = handleWriteRotation(payload);  break;
        case 'writeFine':      result = handleWriteFine(payload);      break;
        case 'deleteFine':     result = handleDeleteFine(payload);     break;
        default: result = { error: '알 수 없는 액션: ' + action };
      }
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ── 스프레드시트 ──────────────────────────────────
function getSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  throw new Error('SPREADSHEET_ID 속성이 설정되지 않았습니다.');
}

// ── PIN ───────────────────────────────────────────
function verifyPin(pin) {
  const stored = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (!stored) throw new Error('ADMIN_PIN이 설정되지 않았습니다.');
  if (pin !== stored) throw new Error('PIN이 올바르지 않습니다.');
}

// ── 전체 데이터 ──────────────────────────────────
// 옛 4열 형식(id,name,formation,assignments)으로 남아 있던 'default' 행을 지운다.
// 새 5열 형식에서는 열이 한 칸씩 밀려 읽혀 쓰레기 행이 되므로 제거. 멱등 — 없으면 아무 일도 안 한다.
function handleGetAll(includePhone) {
  const ss = getSpreadsheet();
  getOrCreateSheet(ss, SHEET_PLAYERS, PLAYER_COLS);
  let players = sheetToObjects(ss, SHEET_PLAYERS, PLAYER_COLS);
  if (!includePhone) players = players.map(function(p) { var q = Object.assign({}, p); delete q.phone; return q; });
  return {
    players:  players,
    rotation: sheetToObjects(ss, SHEET_ROTATION, ROT_COLS),
    fines:    sheetToObjects(ss, SHEET_FINES,    FINE_COLS),
    statLog:  recentStatLog(ss),
  };
}

/** 능력치 기록은 최근 것부터 STATLOG_KEEP 개만. 시트에는 전부 남는다. */
function recentStatLog(ss) {
  const rows = sheetToObjects(ss, SHEET_STATLOG, STATLOG_COLS);
  return rows.length > STATLOG_KEEP ? rows.slice(rows.length - STATLOG_KEEP) : rows;
}

// ── 능력치 (PIN 없는 쓰기) ────────────────────────
/** 아바타와 같은 결의 좁은 경로다. writePlayer 와 나눠 둔 이유도 같다 — 이쪽은 PIN 을
 *  요구하지 않으므로, 한 핸들러에 얹으면 이름·전화번호 같은 다른 칸까지 PIN 없이
 *  새어나갈 여지가 생긴다. 여기서 만지는 칸은 STAT_FIELDS 여섯 개뿐이다.
 *  고친 사람(by)은 홈에서 고른 번호라 자칭이다 — 잠금이 아니라 기록용이다. */
function handleWriteStats(p) {
  const num = String(p && p.num || '');
  if (!num) return { error: '번호가 없습니다' };
  // **보낸 칸만** 손댄다. 여섯 칸을 통째로 받으면, 값이 0 인 선수(아직 안 매긴 능력치)를
  // 한 칸만 고치려 해도 나머지가 검증에 걸리거나 엉뚱한 값으로 덮인다.
  const stats = (p && p.stats) || {};
  const next = {};
  const keys = [];
  for (let i = 0; i < STAT_FIELDS.length; i++) {
    const k = STAT_FIELDS[i];
    if (!Object.prototype.hasOwnProperty.call(stats, k)) continue;
    const v = Number(stats[k]);
    if (!isFinite(v) || Math.floor(v) !== v || v < 1 || v > 99) {
      return { error: k + ' 값이 1~99 정수가 아닙니다' };
    }
    next[k] = v;
    keys.push(k);
  }
  if (keys.length === 0) return { error: '고칠 값이 없습니다' };

  const ss = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_PLAYERS, PLAYER_COLS);
  const data = sheet.getDataRange().getValues();
  const rowIdx = findRowByField(data, 0, num);
  if (rowIdx < 1) return { error: '그 번호의 선수가 없습니다' };

  const byNum = String(p && p.by || '');
  const byRow = byNum ? findRowByField(data, 0, byNum) : -1;
  const byName = byRow > 0 ? String(cell(data[byRow][PLAYER_COLS.indexOf('name')])) : '';

  const log = getOrCreateSheet(ss, SHEET_STATLOG, STATLOG_COLS);
  const ts = new Date().toISOString();
  let changed = 0;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const col = PLAYER_COLS.indexOf(k) + 1;
    const before = Number(cell(data[rowIdx][col - 1])) || 0;
    if (before === next[k]) continue;                 // 안 바뀐 칸은 적지도 쓰지도 않는다
    sheet.getRange(rowIdx + 1, col).setValue(next[k]);
    log.appendRow([ts, byNum, byName, num, k, before, next[k]]);
    changed++;
  }
  return { ok: true, changed: changed };
}

// ── 선수 ─────────────────────────────────────────
function handleWritePlayer(p) {
  const ss = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_PLAYERS, PLAYER_COLS);
  const data  = sheet.getDataRange().getValues();
  const rowIdx = findRowByField(data, 0, String(p.num));
  const row = PLAYER_COLS.map(k => p[k] !== undefined ? p[k] : '');
  if (rowIdx > 0) sheet.getRange(rowIdx+1, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return { ok: true };
}

function handleDeletePlayer(p) {
  const ss    = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_PLAYERS, PLAYER_COLS);
  const data  = sheet.getDataRange().getValues();
  const rowIdx = findRowByField(data, 0, String(p.num));
  if (rowIdx > 0) sheet.deleteRow(rowIdx+1);
  return { ok: true };
}

function handleWriteRotation(r) {
  const ss = getSpreadsheet(); const sheet = getOrCreateSheet(ss, SHEET_ROTATION, ROT_COLS);
  const data = sheet.getDataRange().getValues();
  let rowIdx = -1; for (let i = 1; i < data.length; i++) if (String(data[i][0]) === String(r.year) && String(data[i][1]) === String(r.month)) { rowIdx = i; break; }
  const row = ROT_COLS.map(k => r[k] !== undefined ? r[k] : '');
  if (rowIdx > 0) sheet.getRange(rowIdx + 1, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return { ok: true };
}

// ── 벌금 ─────────────────────────────────────────
function handleWriteFine(f) {
  const ss    = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_FINES, FINE_COLS);
  const data  = sheet.getDataRange().getValues();
  if (!f.id) f.id = String(Date.now());
  const rowIdx = findRowByField(data, 0, String(f.id));
  const row = FINE_COLS.map(k => f[k] !== undefined ? f[k] : '');
  if (rowIdx > 0) sheet.getRange(rowIdx+1, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return { ok: true, id: f.id };
}

function handleDeleteFine(f) {
  const ss    = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_FINES, FINE_COLS);
  const data  = sheet.getDataRange().getValues();
  const rowIdx = findRowByField(data, 0, String(f.id));
  if (rowIdx > 0) sheet.deleteRow(rowIdx+1);
  return { ok: true };
}

// ── 라인업 ───────────────────────────────────────
function isValidAvatarCode(code) {
  if (typeof code !== 'string') return false;
  if (code.length > 120) return false;          // 2026-09-23: 부위 13개까지 들어가게 80 → 120
  if (code === '') return true;                       // 빈 값 = 기본 아바타로 되돌리기
  // f2:h5:s3:e1:k#1a1a1a  — 부품은 영문자+숫자, 색은 3/6자리 hex.
  // 세그먼트 상한 16 — 클라이언트(src/lib/avatar.ts CODE_SHAPE)와 반드시 같은 값(2026-09-23 에 8 → 16).
  return /^([a-z]\d{1,2}:){1,16}k#[0-9a-fA-F]{3,6}$/.test(code);
}

function handleWriteAvatar(p) {
  const num = String(p && p.num || '');
  const code = String(p && p.avatar || '');
  if (!num) return { error: '번호가 없습니다' };
  if (!isValidAvatarCode(code)) return { error: '아바타 코드 형식이 올바르지 않습니다' };

  const ss = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_PLAYERS, PLAYER_COLS);
  const data = sheet.getDataRange().getValues();
  const rowIdx = findRowByField(data, 0, num);
  if (rowIdx < 1) return { error: '그 번호의 선수가 없습니다' };

  const col = PLAYER_COLS.indexOf('avatar') + 1;
  sheet.getRange(rowIdx + 1, col).setValue(code);     // 이 한 칸만
  return { ok: true };
}

// ── 유틸 ─────────────────────────────────────────
// 시트의 열 수가 cols 보다 적으면 넓히고 헤더를 채운다.
// 데이터가 있는 시트는 헤더 재작성이 막혀 있어(아래 분기) 열만 늘어난 스키마 변경을
// 따라가지 못한다 — avatar 열 추가가 그 경우였다.
function ensureColumns(sheet, cols) {
  const have = sheet.getMaxColumns();
  if (have < cols.length) sheet.insertColumnsAfter(have, cols.length - have);
  if (sheet.getLastRow() >= 1) {
    const head = sheet.getRange(1, 1, 1, cols.length).getValues()[0];
    let changed = false;
    for (let i = 0; i < cols.length; i++) {
      if (String(head[i] || '') !== cols[i]) { head[i] = cols[i]; changed = true; }
    }
    if (changed) sheet.getRange(1, 1, 1, cols.length).setValues([head]);
  }
}

function getOrCreateSheet(ss, name, cols) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(cols); return sheet; }
  ensureColumns(sheet, cols);
  if (sheet.getLastRow() <= 1) {
    const head = sheet.getLastRow() === 1 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
    if (head.join('|') !== cols.join('|')) { sheet.clear(); sheet.appendRow(cols); }
  }
  return sheet;
}

function cell(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  return v === undefined ? '' : v;
}

function sheetToObjects(ss, name, cols) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  return data.slice(1).map(row => {
    const obj = {};
    cols.forEach((k, i) => { obj[k] = cell(row[i]); });
    return obj;
  });
}

function findRowByField(data, colIdx, value) {
  for (let i = 1; i < data.length; i++) {
    if (String(cell(data[i][colIdx])) === value) return i;
  }
  return -1;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
