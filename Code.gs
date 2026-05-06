//   A1 = 마지막 업데이트 날짜 (YYYY-MM+DD)
//   B1 = 데이터의 마지막 행 + 1 (exclusive upper bound for loops)
//   A2:D? = [식당, 아침, 점심, 저녁]

const MENU_URL    = 'https://snuco.snu.ac.kr/foodmenu';
const SLACK_HOOK  = 'https://hooks.slack.com/services/###########/###########/########################';
const SKIP_LIST   = ['라운지오', '220동식당', '75-1동 4층 푸드코트', '공대간이식당', '락구정'];
const SHOW_LIST   = ['3식당', '학생회관식당', '예술계식당', '두레미담'];
const COL = { NAME: 1, BREAKFAST: 2, LUNCH: 3, DINNER: 4 };

// 시트의 메뉴 셀이 휴무/없음/운영중단 등 제공할 정보가 없는 상태인지 판정.
// '없음'(parseMenu_가 빈 메뉴를 채울 때 사용)과 식당 자체가 적은 휴무 안내를 모두 거른다.
function isNoMenu_(menu) {
  if (!menu) return true;
  const t = String(menu).trim();
  if (!t || t === '없음') return true;
  return /휴점|휴무|운영하지\s*않|운영중단|미운영/.test(t);
}


// ───────── entry points ─────────

function update(date) {
  Logger.log('try update');
  if (!date) date = todayString_();
  Logger.log(date);

  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getRange(1, 1).getValue() === date) {
    Logger.log('already up to date');
    return;
  }

  const html = UrlFetchApp.fetch(MENU_URL).getContentText();
  const rows = parseMenu_(html);

  const prevLast = sheet.getRange(1, 2).getValue() || 2;
  if (prevLast > 2) sheet.getRange(2, 1, prevLast - 2, 4).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, 4).setValues(rows);

  sheet.getRange(1, 1).setValue(date);
  sheet.getRange(1, 2).setValue(rows.length + 2);
  Logger.log('update success: %s rows', rows.length);
}

function sendmsg() {
  const msg = build_slack_message();
  if (!msg) return;
  UrlFetchApp.fetch(SLACK_HOOK, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: msg }),
  });
}

function doPost(e) {
  const today = new Date();
  const time  = mealColumn_(today.getHours());
  const sheet = SpreadsheetApp.getActiveSheet();

  let selection;
  try {
    selection = getParameterByName('text', e.postData.contents);
  } catch (_) {
    selection = '모두';
  }
  Logger.log(selection);
  sheet.getRange(1, 3).setValue(selection);

  const target = resolveSelection_(selection);
  const data   = readMenuTable_(sheet);

  const colKey = ['breakfast', 'lunch', 'dinner'][time - COL.BREAKFAST];
  const label  = ['아침', '점심', '저녁'][time - COL.BREAKFAST];

  if (target === '__ALL__') {
    const featured = ['3식당', '두레미담', '학생회관식당', '자하연식당 2층'];
    const head = `${today.getMonth() + 1}월 ${today.getDate()}일의 ${label} 메뉴입니다.\n`;
    const blocks = [];
    for (const row of data) {
      if (!featured.includes(row.name)) continue;
      if (isNoMenu_(row[colKey])) continue;
      blocks.push(`${row.name}\n\`\`\`${row[colKey]}\`\`\``);
    }
    const msg = blocks.length
      ? head + blocks.join('\n') + '\n'
      : `${today.getMonth() + 1}월 ${today.getDate()}일 ${label}은 운영중인 식당이 없습니다.`;
    Logger.log(msg);
    return ContentService.createTextOutput(msg);
  }

  if (target === null) {
    return ContentService.createTextOutput(
      '도저히 예측하지 못한 식당 이름입니다. 조금 더 보편적인 식당 이름으로 검색해주세요.'
    );
  }

  for (const row of data) {
    if (row.name !== target) continue;
    const msg = isNoMenu_(row[colKey])
      ? `${row.name}은 오늘 ${label} 메뉴 정보가 없습니다.`
      : `${row.name}\n\`\`\`${row[colKey]}\`\`\``;
    Logger.log(msg);
    return ContentService.createTextOutput(msg);
  }
}


// ───────── parsing ─────────

// 페이지 HTML에서 [name, breakfast, lunch, dinner] 행 배열을 만든다.
// 헤더 행(`<a href>식당</a>`)은 href 검사로 걸러내고,
// 외주/제외 식당은 SKIP_LIST로 걸러낸다.
function parseMenu_(html) {
  const rowRe  = /<tr>\s*<td class="title">\s*([\S\s]+?)\s*<\/td>([\S\s]+?)<\/tr>/g;
  const mealRe = /<td class="(breakfast|lunch|dinner)">([\S\s]*?)<\/td>/g;
  const rows = [];

  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const titleRaw = m[1];
    if (titleRaw.includes('href')) continue;          // header row

    const name = titleRaw.replace(/\s*\(\d+-\d+\)\s*$/, '').replace(/^\*\s*/, '').trim();
    if (SKIP_LIST.includes(name)) continue;

    const meals = { breakfast: '', lunch: '', dinner: '' };
    let mb;
    while ((mb = mealRe.exec(m[2])) !== null) {
      meals[mb[1]] = cleanMenu_(name, mb[2]);
    }
    rows.push([name, meals.breakfast || '없음', meals.lunch || '없음', meals.dinner || '없음']);
  }
  return rows;
}

// 한 셀의 raw HTML을 사람이 읽기 좋은 텍스트로 정리한다.
function cleanMenu_(name, raw) {
  let s = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');

  // 두레미담은 셀프코너만 보여주고 주문식 메뉴 이하는 잘라낸다.
  if (name === '두레미담') {
    s = s.replace(/<주문식 메뉴>[\s\S]*$/, '');
  }
  // 3식당의 든든한끼샐러드 안내문구 정리.
  if (name === '3식당') {
    s = s
      .replace(/<든든한끼샐러드코너>/g, '')
      .replace(/\(채식변경가능\)/g, '')
      .replace(/든든한끼샐러드 코너는 항상 채식변경가능합니다/g, '');
  }

  // 운영시간 / 단체예약 안내 등 메뉴와 무관한 꼬리는 제거.
  s = s
    .replace(/[※▶]?\s*운영시간[\s\S]*$/, '')
    .replace(/[※☎]?\s*저녁 단체예약문의[\s\S]*$/, '')
    .replace(/<TAKE-OUT[^>]*>[\s\S]*$/, '');

  // 흔적 기호와 빈 줄 정리.
  s = s
    .replace(/[※▶]/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  return s;
}


// ───────── helpers ─────────

// 시트가 'YYYY-MM-DD'를 자동으로 Date 객체로 변환해버리면 다음 실행 시
// getValue() === date 비교가 항상 false가 되어 매번 다시 fetch한다.
// 이를 막기 위해 일부러 비표준 구분자(`+`)를 섞어 시트가 날짜로 인식하지 못하게 한다.
function todayString_() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}+${d.getDate()}`;
}

// hour → 시트 컬럼: 9시 미만 아침, 13시 미만 점심, 그 외 저녁
function mealColumn_(hour) {
  if (hour < 9)  return COL.BREAKFAST;
  if (hour < 13) return COL.LUNCH;
  return COL.DINNER;
}

// A2:D(lastRow)를 한 번에 읽어 객체 배열로 변환.
function readMenuTable_(sheet) {
  const lastRow = sheet.getRange(1, 2).getValue();
  if (!lastRow || lastRow <= 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 2, 4).getValues();
  return values.map(r => ({
    name:      r[0],
    breakfast: r[1],
    lunch:     r[2],
    dinner:    r[3],
  }));
}

// Slack 슬래시 커맨드 텍스트 → 정규 식당 이름 (또는 '__ALL__' / null).
function resolveSelection_(text) {
  const aliases = {
    '3식당':           ['농식', '농', '3식', '삼식', '농대', '농대식당', '전망대', '전망대식당', '전식'],
    '학생회관식당':    ['학', '학관', '학식', '1식', '천식', '학생식당', '학생회관', '학생회관식당', '학관식당', '학관식'],
    '자하연식당 2층':  ['자하연', '자', '자하연식당', '자식'],
    '예술계식당':      ['예', '예술', '예술계', '예식'],
    '두레미담':        ['두레', '두레미담', '두래', '두래미담', '두식', '농협', '뷔폐', '뷔페', '부페'],
  };
  for (const canon of Object.keys(aliases)) {
    if (aliases[canon].includes(text)) return canon;
  }
  if (['모두', 'every', ''].includes(text)) return '__ALL__';
  return null;
}


// ───────── slack push ─────────

function build_slack_message() {
  const EMOJI = ':knife_fork_plate: *';
  const today = new Date();

  // 토/일은 알림 생략.
  if (today.getDay() % 6 === 0) {
    Logger.log('skip sat and sun.');
    return '';
  }
  const time = today.getHours() < 13 ? COL.LUNCH : COL.DINNER;
  const colKey = time === COL.LUNCH ? 'lunch' : 'dinner';

  const sheet = SpreadsheetApp.getActiveSheet();
  const data  = readMenuTable_(sheet);
  const byName = Object.fromEntries(data.map(r => [r.name, r]));

  const lines = [];
  for (const name of SHOW_LIST) {
    const row = byName[name];
    if (!row) continue;
    const menu = row[colKey];
    if (isNoMenu_(menu)) continue;
    lines.push(`${EMOJI}${name}* – ${String(menu).replace(/\r\n|\r|\n/g, ' | ')}`);
  }
  const msg = lines.join('\n');
  Logger.log(msg);
  return msg;
}


// ───────── slack form post helper ─────────

function getParameterByName(name, str) {
  name = name.replace(/[\[\]]/g, '\\$&');
  const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
  const results = regex.exec(str);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}
