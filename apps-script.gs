// =====================================================
// WEEKLY FC — Google Apps Script Backend v2
// =====================================================

const SHEET_PLAYERS  = '선수명단';
const SHEET_MATCHES  = '매치기록';
const SHEET_ROTATION = '봉사로테이션';
const SHEET_FINES    = '벌금';
const SHEET_COMMENTS = '댓글';
const SHEET_LINEUPS  = '라인업';

const PLAYER_COLS  = ['num','pos','detail','foot','name','phone','vest','note','pace','dribble','pass','shoot','defend','stamina'];
const MATCH_COLS   = ['id','date','location','youtube','team_a','team_b','score_a','score_b','attendees'];
const ROT_COLS     = ['year','month','p1','p2','done'];
const FINE_COLS    = ['id','date','match_id','player','type','amount','paid'];
const COMMENT_COLS = ['id','match_id','author','content','timestamp'];
const LINEUP_COLS  = ['id','name','formation','assignments'];

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
      result = handleGetChannelVideos();
    } else if (action === 'getComments') {
      result = handleGetComments(e.parameter.match_id || '');
    } else if (action === 'addComment') {
      result = handleAddComment(payload); // 누구나 댓글 가능
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
        case 'deleteComment':  result = handleDeleteComment(payload);  break;
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
function handleGetAll(includePhone) {
  const ss = getSpreadsheet();
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
  const ss    = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_ROTATION, ROT_COLS);
  const data  = sheet.getDataRange().getValues();
  let rowIdx  = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(r.year) && String(data[i][1]) === String(r.month)) { rowIdx = i; break; }
  }
  const row = ROT_COLS.map(k => r[k] !== undefined ? r[k] : '');
  if (rowIdx > 0) sheet.getRange(rowIdx+1, 1, 1, row.length).setValues([row]);
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

// ── 댓글 ─────────────────────────────────────────
function handleGetComments(matchId) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_COMMENTS);
  if (!sheet) return { comments: [] };
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { comments: [] };
  const comments = data.slice(1)
    .filter(row => String(row[1]) === String(matchId))
    .map(row => {
      const obj = {};
      COMMENT_COLS.forEach((k, i) => { obj[k] = row[i] !== undefined ? row[i] : ''; });
      return obj;
    });
  return { comments };
}

function handleAddComment(c) {
  const ss    = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_COMMENTS, COMMENT_COLS);
  if (!c.id) c.id = String(Date.now());
  if (!c.timestamp) c.timestamp = new Date().toISOString();
  const row = COMMENT_COLS.map(k => c[k] !== undefined ? c[k] : '');
  sheet.appendRow(row);
  return { ok: true, id: c.id };
}

function handleDeleteComment(c) {
  const ss    = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_COMMENTS, COMMENT_COLS);
  const data  = sheet.getDataRange().getValues();
  const rowIdx = findRowByField(data, 0, String(c.id));
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

// ── 유튜브 채널 영상 ──────────────────────────────
function handleGetChannelVideos() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('YT_VIDEOS');
  if (cached) return { videos: JSON.parse(cached) };
  try {
    var feed = UrlFetchApp.fetch(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UCfL5rqpEVpMPe-FNG2UvobA',
      { muteHttpExceptions: true }
    ).getContentText();
    var entries = feed.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    var videos = [];
    entries.forEach(function(e) {
      var id    = (e.match(/<yt:videoId>([^<]+)/) || [])[1];
      var title = (e.match(/<title>([^<]+)/)       || [])[1];
      var pub   = (e.match(/<published>([^<]+)/)   || [])[1];
      if (id && title) videos.push({
        id: id,
        title: title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'"),
        published: pub ? pub.slice(0,10) : ''
      });
    });
    cache.put('YT_VIDEOS', JSON.stringify(videos), 600);
    return { videos: videos };
  } catch(e) {
    return { videos: [] };
  }
}

// ── 유틸 ─────────────────────────────────────────
function getOrCreateSheet(ss, name, cols) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(cols); }
  return sheet;
}

function sheetToObjects(ss, name, cols) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  return data.slice(1).map(row => {
    const obj = {};
    cols.forEach((k, i) => { obj[k] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  });
}

function findRowByField(data, colIdx, value) {
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx]) === value) return i;
  }
  return -1;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
