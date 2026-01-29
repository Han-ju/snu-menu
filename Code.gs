function test(msg) {
  msg = build_slack_message();
}

function sendmsg(msg) {
  msg = build_slack_message();
  if (msg.length == 0) return;

  var url = "https://hooks.slack.com/services/###########/###########/########################";
  var data = {
    method: "post",
    contentType: 'application/json',
    payload: JSON.stringify({ "text": msg })
    }
  var response = UrlFetchApp.fetch(url, data);

}

function update(date) {
  Logger.log("try update");
  if(!date){
    var today = new Date();
    var date = today.getFullYear()+'-'+(today.getMonth()+1)+'+'+today.getDate();
    Logger.log(date+" "+today.getHours()+":"+today.getMinutes());

  }
  var sheet = SpreadsheetApp.getActiveSheet();
  var last_date = sheet.getRange(1, 1).getValue();
  if (last_date == date) {
    Logger.log("already up to date");
    return;
  }

  var html = UrlFetchApp.fetch("https://snuco.snu.ac.kr/foodmenu").getContentText();
  //var regex_a = / +<tr  class="[^"]+">\n *<td  class="views-field views-field-field-restaurant">\n *([^ ]*?)(?:\(\d+-\d+\))? *<\/td>([\s\S]+?)(?=<\/tr>)/g;
  //var regex_a = /<table class="menu-table">[\S\s]+?<\/table>/g;
  var regex_a = /<tr>\s+<td class="title">\s*([\S\s]+?)(?: \(\d+-\d+\))?\s*<\/td>([\S\s]+?)<\/tr>/g;
  //var regex_b = / +<td  class="views-field views-field-field-(breakfast|lunch|dinner)">\n *(?:<p>|<div>|<div style[^>]+?>)([\s\S]+?)(?=<\/td>|<p><span|<p style)/g
  var regex_b = /<td class="(breakfast|lunch|dinner)">([\S\s]*?)<\/td>/g;

  var index = 2;
  var block;
  sheet.getRange('A2:D'+sheet.getRange(1, 2).getValue()).clearContent();
  
  while (block = regex_a.exec(html)) {
    if (block[1].includes("href")) continue;
    if (["라운지오", "220동식당", "75-1동 4층 푸드코트", "공대간이식당"].includes(block[1])) continue;
    sheet.getRange(index, 1).setValue(block[1]);
    var time_menu;
    sheet.getRange('B'+index+':'+'D'+index).setValue("없음");
    while (time_menu = regex_b.exec(block[2])) {
      var col = ['1 start', 'restaurant', 'breakfast', 'lunch', 'dinner'].indexOf(time_menu[1]);
      var extracts = time_menu[2];
      extracts = extracts.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replaceAll('&nbsp;', '').replaceAll('<br />', '');
      sheet.getRange(index, col+3).setValue(extracts);
      if (block[1] == '두레미담')
        try {
        extracts = /([\s\S]+?)<주문식 메뉴>[\s\S]*/g.exec(extracts)[1];
        } catch (error) {
          extracts = extracts
        }
        finally {
          extracts = extracts.trim().replace(/(?:\r\n|\r|\n)/g, ', ');
        }
      else if (block[1] == '3식당') {
        extracts = extracts.replaceAll('<든든한끼샐러드코너>', '').trim();
        extracts = extracts.replaceAll('(채식변경가능)', '').trim();
        extracts = extracts.replaceAll('든든한끼샐러드 코너는 항상 채식변경가능합니다', '').trim();
      }
      if (extracts.includes("운영시간"))
        extracts = /([\s\S]+?)운영시간[\s\S]*/g.exec(extracts)[1]
      extracts = extracts.replaceAll('☎저녁 단체예약문의: 02-880-7889', '').trim();
      extracts = extracts.replaceAll('※', '').replaceAll('▶', '').replaceAll("\n\n", '\n').trim();
      if (extracts) sheet.getRange(index, col).setValue(extracts);
    }
    index++;
  }
  sheet.getRange(1, 1).setValue(date)
  sheet.getRange(1, 2).setValue(index);
  Logger.log("update success");
}

// Now doesn't work. It requires login.
function update_old() {
  Logger.log("try update");
  var today = new Date();
  var date = today.getFullYear()+'-'+("0" + (today.getMonth() + 1)).slice(-2) + '-' + ("0" + today.getDate()).slice(-2);
  Logger.log(date+" "+today.getHours()+":"+today.getMinutes());
  var sheet = SpreadsheetApp.getActiveSheet();

  sheet.getRange(1, 1).setValue("[[[" + date + "]]]");

  var url = "https://m.snu.ac.kr/api/findRestMenuList.action?date=" + date;

  var param = {
    "method": "post",
    "headers": {"Content-Type": "application/json"},
    "payload": JSON.stringify({"ssoCheckYn": "n"})
    }

  var response = JSON.parse(UrlFetchApp.fetch(url, param).getContentText().replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&").replaceAll("&nbsp;", " ").replaceAll("| | ", "| "))['api'];

  sheet.getRange('A2:D'+sheet.getRange(1, 2).getValue()).clearContent();
  
  var times = ["breakfast", "lunch", "dinner"]

  var row = 2;
  for (var i = 0; i < response.length; i++) {
    var restaurant = response[i]["restaurant"];
    if (["라운지오", "220동식당", "75-1동 4층 푸드코트", "공대간이식당", "락구정"].includes(restaurant)) continue;
    sheet.getRange(row, 1).setValue(restaurant);
    for (var j = 0 ; j < 3 ; j++) {
      var text = response[i][times[j]];
      if (text == null) continue;
      sheet.getRange(row, j+2).setValue(text.replaceAll(/<주문식 메뉴>[\s\S]*/g, "").replaceAll(/<TAKE-OUT: 9시~16시>[\s\S]*/g, "").replaceAll(/[※▶]\s?운영시간[\s\S]*/g, "").replaceAll(/(\| )*\|?$/g, "").replaceAll(/ ?\| /g, " | "));
    }
    row++;
  }
  sheet.getRange(1, 2).setValue(row);
  Logger.log("update success");
}

function getParameterByName(name, str) {
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(str);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

function build_slack_message() {
  const EMOJI = ":knife_fork_plate: *";
  
  var today = new Date();
  var sheet = SpreadsheetApp.getActiveSheet();
  
  var time;

  if(today.getDay() % 6 == 0){
    Logger.log("skip sat and sun.");
    return "";
  }

  // t < 13 lunch / 13 <= t dinner
  if(today.getHours() < 13){
    time = 3;
  } else {
    time = 4;
  }

  var msg = "";
  var flag = false;

  const TOSHOWLIST = ['3식당', '학생회관식당', '예술계식당', '두레미담'];
  
  for (var x = 0 ; x < TOSHOWLIST.length ; x++) {
    for (var i = 1 ; i < sheet.getRange(1, 2).getValue() ; i++) {
      if(TOSHOWLIST[x] === sheet.getRange(i, 1).getValue() && !sheet.getRange(i, time).getValue().includes("없음") && !sheet.getRange(i, time).getValue().includes("휴점")){
        flag = true;
        var msg = msg + EMOJI + sheet.getRange(i, 1).getValue() + '* – ' + sheet.getRange(i, time).getValue().replace(/(?:\r\n|\r|\n)/g, ' | ') + '\n';
        break;
      }
    }
  }

  if (flag) {
    msg = msg.substring(0, msg.length - 1);
  }

  Logger.log(msg)
  return msg
}

// when bot get post
function doPost(e) {
  var today = new Date();
  var sheet = SpreadsheetApp.getActiveSheet();
  
  var time;
  // 7 <= t < 9 breakfast / 9 <= t < 13 lunch / 13 <= t < 19 dinner
  if(today.getHours() < 9){
    time = 2;
  } else if(today.getHours() < 13){
    time = 3;
  } else {
    time = 4;
  }

  var selection;
  try {
    selection = getParameterByName("text", e.postData.contents);
  } catch(e) {
    selection = '모두';
  }
  Logger.log(selection);
  sheet.getRange(1, 3).setValue(selection);
  if(['농식', '농', '3식', '삼식', '농대', '농대식당','전망대', '전망대식당', '전식'].includes(selection)){
    selection = '3식당';
  } else if(['학', '학관', '학식', '1식', '천식', '학생식당','학생회관', '학생회관식당', '학관식당', '학관식'].includes(selection)){
    selection = '학생회관식당';
  } else if(['자하연', '자', '자하연식당', '자식'].includes(selection)){
    selection = '자하연식당 2층';
  } else if(['예', '예술', '예술계', '예식'].includes(selection)){
    selection = '예술계식당';
  } else if(['두레', '두레미담', '두래', '두래미담', '두식', '농협', '뷔폐', '뷔페', '부페'].includes(selection)){
    selection = '두레미담';
  } else if(['모두', 'every', ''].includes(selection)){
      var msg = (today.getMonth()+1)+'월 '+today.getDate() + '일의 ' + ['아침', '점심', '저녁'][time - 2] + ' 메뉴입니다.\n';
      for (var i = 1 ; i < sheet.getRange(1, 2).getValue() ; i++) {
        if(['3식당', '두레미담', '학생회관식당', '자하연식당 2층'].includes(sheet.getRange(i, 1).getValue()) && sheet.getRange(i, time).getValue() != ""){
          var msg = msg + sheet.getRange(i, 1).getValue() + '\n```' + sheet.getRange(i, time).getValue() + '```\n';
        }
      }
      Logger.log(msg)
      return ContentService.createTextOutput(msg);
  
  } else {
    return ContentService.createTextOutput("도저히 예측하지 못한 식당 이름입니다. 조금 더 보편적인 식당 이름으로 검색해주세요.")
  }

  for (var i = 1 ; i < sheet.getRange(1, 2).getValue() ; i++) {
    if(sheet.getRange(i, 1).getValue() == selection){
      var msg = sheet.getRange(i, 1).getValue() + '\n```' + sheet.getRange(i, time).getValue() + '```';
      //sendmsg(msg);
      Logger.log(msg)
      return ContentService.createTextOutput(msg);
    }
  }
}
