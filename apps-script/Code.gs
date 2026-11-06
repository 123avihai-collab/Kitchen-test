/**
 * קליטת תכנונים מאתר "מטבח תלת-ממדי" ושמירתם ב-Google Drive + גיליון.
 * מותקן מתוך Google Sheet: הרחבות → Apps Script. הוראות מלאות: apps-script/README.md
 */

// שם התיקייה ב-Drive שאליה נשמרות ההגשות
const FOLDER_NAME = 'הגשות – מטבח תלת-ממדי';
// מייל להתראה על כל הגשה. ריק = המייל של בעל הסקריפט. 'none' = בלי מייל
const NOTIFY_EMAIL = '';
// מגבלת גודל להגשה (בתים)
const MAX_BYTES = 15 * 1024 * 1024;

function doPost(e) {
  try {
    const raw = e.postData && e.postData.contents;
    if (!raw || raw.length > MAX_BYTES) return json_({ ok: false, error: 'too large' });
    const p = JSON.parse(raw);
    if (!p.state || !Array.isArray(p.state.wall)) return json_({ ok: false, error: 'bad design' });

    const folder = getFolder_();
    const tz = Session.getScriptTimeZone();
    const stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH-mm');
    const name = String(p.name || 'ללא שם').slice(0, 60);
    const base = stamp + ' – ' + name.replace(/[\\/:*?"<>|]/g, '');

    const design = { app: 'kitchen-lab', name: name, phone: p.phone || '', note: p.note || '', at: p.at, state: p.state, assets: p.assets || {} };
    const file = folder.createFile(base + '.json', JSON.stringify(design), 'application/json');

    let imgFile = null, imgBlob = null;
    const m = String(p.image || '').match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (m) {
      imgBlob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], base + '.jpg');
      imgFile = folder.createFile(imgBlob);
    }

    const openUrl = p.site ? p.site + '?sub=' + file.getId() : '';
    const sheet = getSheet_();
    const link = (url, label) => url ? '=HYPERLINK("' + url + '","' + label + '")' : '';
    sheet.appendRow([new Date(), name, p.phone || '', p.note || '', link(openUrl, 'פתח בכלי'), link(imgFile ? imgFile.getUrl() : '', 'צילום'), link(file.getUrl(), 'קובץ')]);

    notify_(name, p, openUrl, imgBlob);
    return json_({ ok: true, id: file.getId() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// האתר טוען הגשה לפי מזהה (רק קבצים מתיקיית ההגשות)
function doGet(e) {
  const id = e && e.parameter && e.parameter.id;
  if (!id) return json_({ ok: true, service: 'kitchen-lab' });
  try {
    const file = DriveApp.getFileById(id);
    let inFolder = false; const it = file.getParents();
    while (it.hasNext()) if (it.next().getName() === FOLDER_NAME) inFolder = true;
    if (!inFolder) return json_({ ok: false, error: 'not found' });
    const d = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
    d.ok = true;
    return json_(d);
  } catch (err) {
    return json_({ ok: false, error: 'not found' });
  }
}

function notify_(name, p, openUrl, imgBlob) {
  if (NOTIFY_EMAIL === 'none') return;
  const to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  if (!to) return;
  const esc = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  let html = '<div dir="rtl" style="font-family:Arial,sans-serif">'
    + '<h2 style="margin:0 0 8px">תכנון מטבח חדש מ' + esc(name) + '</h2>'
    + (p.phone ? '<div>טלפון: ' + esc(p.phone) + '</div>' : '')
    + (p.note ? '<div>הערה: ' + esc(p.note) + '</div>' : '')
    + (openUrl ? '<p><a href="' + openUrl + '" style="background:#e8893a;color:#1b1309;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:bold">פתח בכלי העריכה</a></p>' : '');
  const opts = { htmlBody: '', name: 'מטבח תלת-ממדי' };
  if (imgBlob) { html += '<img src="cid:shot" style="max-width:100%;border-radius:8px">'; opts.inlineImages = { shot: imgBlob }; }
  opts.htmlBody = html + '</div>';
  MailApp.sendEmail(to, 'תכנון מטבח חדש – ' + name, 'תכנון חדש מ' + name + (openUrl ? '\n' + openUrl : ''), opts);
}

function getFolder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('הגשות');
  if (!sh) {
    sh = ss.insertSheet('הגשות', 0);
    sh.appendRow(['תאריך', 'שם', 'טלפון', 'הערה', 'פתיחה בכלי', 'צילום מסך', 'קובץ']);
    sh.setFrozenRows(1); sh.setRightToLeft(true);
    sh.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#f3e3d3');
  }
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// להרצה ידנית פעם אחת מתוך העורך – מאשר הרשאות ויוצר תיקייה וגיליון
function setup() {
  getFolder_(); getSheet_();
  Logger.log('מוכן. תיקייה: ' + FOLDER_NAME);
}
