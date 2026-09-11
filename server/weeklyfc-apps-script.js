// =====================================================
// WEEKLY FC — Google Apps Script Backend v2
// =====================================================

const SHEET_PLAYERS  = '선수명단';
const SHEET_MATCHES  = '매치기록';
const SHEET_ROTATION = '봉사로테이션';
const SHEET_FINES    = '벌금';
const SHEET_LINEUPS  = '라인업';

const PLAYER_COLS  = ['num','pos','detail','foot','name','phone','vest','note','pace','dribble','pass','shoot','defend','stamina','rot','avatar'];
const MATCH_COLS   = ['id','date','location','youtube','type','attendees','teams','winner'];
const ROT_COLS     = ['year','month','p1','p2','done'];
const FINE_COLS    = ['id','date','match_id','player','type','amount','paid'];
const LINEUP_COLS  = ['id','match_id','name','formation','assignments'];

function doGet(e) {
  try {
    const action  = e.parameter.action  || '';
    const pin     = e.parameter.pin     || '';
    const payload = e.parameter.payload ? JSON.parse(decodeURIComponent(e.parameter.payload)) : {};

    let result;

    // 읽기 액션 (PIN 불필요)
    if (action === 'getAll') {
      result = handleGetAll(false);
    } else if (action === 'getChannelVideos') {
      result = handleGetChannelVideos(e.parameter.nocache === '1');
    } else if (action === 'writeAvatar') {
      // PIN 없이 동작하는 유일한 쓰기. 아바타 칸 하나만 건드린다 — 아래 핸들러 주석 참고.
      result = handleWriteAvatar(payload);
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
        case 'writeMatch':     result = handleWriteMatch(payload);     break;
        case 'deleteMatch':    result = handleDeleteMatch(payload);    break;
        case 'writeRotation':  result = handleWriteRotation(payload);  break;
        case 'writeFine':      result = handleWriteFine(payload);      break;
        case 'deleteFine':     result = handleDeleteFine(payload);     break;
        case 'writeLineup':    result = handleWriteLineup(payload);    break;
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
function dropLegacyLineupRow(ss) {
  const sheet = ss.getSheetByName(SHEET_LINEUPS);
  if (!sheet || sheet.getLastRow() < 2) return;
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === 'default' && String(data[i][4] || '') === '') { sheet.deleteRow(i + 1); }
  }
}

function handleGetAll(includePhone) {
  const ss = getSpreadsheet();
  getOrCreateSheet(ss, SHEET_PLAYERS, PLAYER_COLS);
  getOrCreateSheet(ss, SHEET_MATCHES, MATCH_COLS);
  dropLegacyLineupRow(ss);
  getOrCreateSheet(ss, SHEET_LINEUPS, LINEUP_COLS);
  let players = sheetToObjects(ss, SHEET_PLAYERS, PLAYER_COLS);
  if (!includePhone) players = players.map(function(p) { var q = Object.assign({}, p); delete q.phone; return q; });
  return {
    players:  players,
    matches:  sheetToObjects(ss, SHEET_MATCHES,  MATCH_COLS),
    rotation: sheetToObjects(ss, SHEET_ROTATION, ROT_COLS),
    fines:    sheetToObjects(ss, SHEET_FINES,    FINE_COLS),
    lineups:  sheetToObjects(ss, SHEET_LINEUPS,  LINEUP_COLS),
  };
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

// ── 매치 ─────────────────────────────────────────
function handleWriteMatch(m) {
  const ss    = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_MATCHES, MATCH_COLS);
  const data  = sheet.getDataRange().getValues();
  if (!m.id) m.id = String(Date.now());
  const rowIdx = findRowByField(data, 0, String(m.id));
  const row = MATCH_COLS.map(k => m[k] !== undefined ? m[k] : '');
  if (rowIdx > 0) sheet.getRange(rowIdx+1, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return { ok: true, id: m.id };
}

function handleDeleteMatch(m) {
  const ss    = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_MATCHES, MATCH_COLS);
  const data  = sheet.getDataRange().getValues();
  const rowIdx = findRowByField(data, 0, String(m.id));
  if (rowIdx > 0) sheet.deleteRow(rowIdx+1);
  return { ok: true };
}

// ── 봉사 ─────────────────────────────────────────
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
function handleWriteLineup(l) {
  const ss    = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_LINEUPS, LINEUP_COLS);
  const data  = sheet.getDataRange().getValues();
  if (!l.id) l.id = 'default';
  const rowIdx = findRowByField(data, 0, String(l.id));
  if (typeof l.assignments === 'object') l.assignments = JSON.stringify(l.assignments);
  const row = LINEUP_COLS.map(k => l[k] !== undefined ? l[k] : '');
  if (rowIdx > 0) sheet.getRange(rowIdx+1, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return { ok: true };
}

// ── 아바타 ───────────────────────────────────────
// 팀원 누구나 잠금 없이 쓸 수 있는 유일한 액션(사용자 결정 2026-09-11).
// 그래서 writePlayer 를 재사용하지 않는다 — 잠금 없는 경로가 능력치·이름·전화를
// 건드릴 수 있으면 안 되므로, 이 함수는 avatar 열 한 칸만 setValue 한다.
function isValidAvatarCode(code) {
  if (typeof code !== 'string') return false;
  if (code.length > 80) return false;
  if (code === '') return true;                       // 빈 값 = 기본 아바타로 되돌리기
  // f2:h5:s3:e1:k#1a1a1a  — 부품은 영문자+숫자, 색은 3/6자리 hex
  return /^([a-z]\d{1,2}:){1,8}k#[0-9a-fA-F]{3,6}$/.test(code);
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

// ── 유튜브 채널 영상 ──────────────────────────────
function handleGetChannelVideos(nocache) {
  var cache = CacheService.getScriptCache();
  if (!nocache) { var cached = cache.get('YT_VIDEOS'); if (cached) return { videos: JSON.parse(cached) }; }
  // 유튜브 RSS 가 구글 서버 쪽 요청을 간헐적으로 막는다(500/404 를 섞어 준다) — 재시도하고,
  // 성공하면 6시간(CacheService 최대) 보관해 한 번의 성공이 오래 버티게 한다.
  var lastCode = 0;
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var res = UrlFetchApp.fetch('https://www.youtube.com/feeds/videos.xml?channel_id=UCfL5rqpEVpMPe-FNG2UvobA',
        { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/atom+xml,application/xml' } });
      lastCode = res.getResponseCode();
      if (lastCode === 200) {
        var entries = res.getContentText().match(/<entry>([\s\S]*?)<\/entry>/g) || [];
        var videos = entries.map(function(e) {
          var id = (e.match(/<yt:videoId>([^<]+)/) || [])[1];
          var title = (e.match(/<title>([^<]+)/) || [])[1];
          var pub = (e.match(/<published>([^<]+)/) || [])[1];
          return id && title ? { id: id, title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'), published: pub ? pub.slice(0, 10) : '' } : null;
        }).filter(Boolean);
        if (videos.length) cache.put('YT_VIDEOS', JSON.stringify(videos), 21600);
        return { videos: videos };
      }
    } catch (e) { lastCode = 'fetch failed: ' + e.message; }
    if (attempt < 2) Utilities.sleep(800 * (attempt + 1));
  }
  var stale = cache.get('YT_VIDEOS');
  if (stale) return { videos: JSON.parse(stale), error_detail: 'youtube ' + lastCode + ' (캐시 사용)' };
  return { videos: [], error_detail: 'youtube ' + lastCode };
}

// ── 능력치 1-5 → 1-99 스케일 일괄 마이그레이션 ──────────
function migrateStats() {
  const SCALE = {1:40, 2:55, 3:70, 4:84, 5:99};
  const STAT_KEYS = ['pace','dribble','pass','shoot','defend','stamina'];
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PLAYERS);
  if (!sheet) { Logger.log('선수명단 시트 없음'); return; }
  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    let changed = false;
    STAT_KEYS.forEach(function(key) {
      const colIdx = PLAYER_COLS.indexOf(key);
      if (colIdx < 0) return;
      const val = Number(data[i][colIdx]);
      if (val >= 1 && val <= 5) {
        data[i][colIdx] = SCALE[val] || 70;
        changed = true;
      }
    });
    if (changed) {
      sheet.getRange(i + 1, 1, 1, data[i].length).setValues([data[i]]);
      count++;
    }
  }
  Logger.log('마이그레이션 완료: ' + count + '명 업데이트');
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
