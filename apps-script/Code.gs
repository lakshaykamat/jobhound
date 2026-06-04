// Job Finder — Sheets bridge (Google Apps Script Web App).
//
// Deploy:
//   1. Open the target spreadsheet → Extensions → Apps Script.
//   2. Paste this file as Code.gs.
//   3. Project Settings → Script properties → add SHARED_TOKEN = <random-secret>.
//   4. Deploy → New deployment → Type: Web app → Execute as: Me, Access: Anyone.
//   5. Copy the /exec URL into APPS_SCRIPT_URL in .env.
//
// Request body: { token, action, records? }
// Actions: ensureHeader | readAll | upsert | bulkImport | selfTest

const SHEET_NAME = 'Jobs';
const COLUMNS = [
  'job_id', 'title', 'company', 'location', 'work_mode',
  'salary_min', 'salary_max', 'seniority', 'source', 'apply_url',
  'posted_date', 'score', 'rationale', 'breakdown', 'status', 'first_seen', 'last_seen',
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const expected = PropertiesService.getScriptProperties().getProperty('SHARED_TOKEN');
    if (!expected || body.token !== expected) return json({ error: 'unauthorized' });

    switch (body.action) {
      case 'ensureHeader':  return json(ensureHeader());
      case 'readAll':       return json({ records: readAll() });
      case 'upsert':        return json(upsert(body.records || []));
      case 'bulkImport':    return json(bulkImport(body.records || []));
      case 'selfTest':      return json(selfTest());
      default:              return json({ error: 'unknown action: ' + body.action });
    }
  } catch (err) {
    return json({ error: String(err) });
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function ensureHeader() {
  const sheet = getSheet();
  const currentWidth = Math.max(sheet.getLastColumn(), COLUMNS.length);
  const header = sheet.getRange(1, 1, 1, currentWidth).getValues()[0];
  const empty = header.every(function (v) { return v === '' || v === null; });

  if (empty) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    return { ok: true, action: 'wrote-header' };
  }

  const trimmed = header.slice(0, COLUMNS.length).map(function (v) { return String(v || ''); });
  const matches = COLUMNS.every(function (c, i) { return trimmed[i] === c; });
  if (matches) return { ok: true, action: 'unchanged' };

  // Detect appended-only migration: existing header is a strict prefix of COLUMNS.
  const existing = header.filter(function (v) { return v !== '' && v !== null; }).map(String);
  const prefixOnly = existing.every(function (c, i) { return COLUMNS[i] === c; });
  if (prefixOnly && existing.length < COLUMNS.length) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    return { ok: true, action: 'extended-header', added: COLUMNS.slice(existing.length) };
  }

  return {
    error:
      'Sheet header does not match expected COLUMNS and is not a simple extension. ' +
      'Expected: ' + COLUMNS.join(', ') + '. Found: ' + existing.join(', ') + '. ' +
      'Resolve manually (clear row 1 and re-run ensureHeader, or align columns) before continuing.'
  };
}

function readAll() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const rows = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  return rows.filter(function (r) { return r[0]; }).map(rowToRecord);
}

function upsert(records) {
  if (!records.length) return { inserted: 0, updated: 0 };
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  const existing = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues()
    : [];

  const firstSeenIdx = COLUMNS.indexOf('first_seen');
  const indexById = {};
  existing.forEach(function (row, i) {
    if (row[0]) indexById[row[0]] = { rowNumber: i + 2, firstSeen: row[firstSeenIdx] };
  });

  let inserted = 0;
  let updated = 0;
  const appendRows = [];

  for (const r of records) {
    const found = indexById[r.job_id];
    if (found) {
      const merged = Object.assign({}, r, { first_seen: found.firstSeen });
      sheet.getRange(found.rowNumber, 1, 1, COLUMNS.length).setValues([recordToRow(merged)]);
      updated++;
    } else {
      appendRows.push(recordToRow(r));
      inserted++;
    }
  }

  if (appendRows.length) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, appendRows.length, COLUMNS.length).setValues(appendRows);
  }

  return { inserted: inserted, updated: updated };
}

function bulkImport(records) {
  if (!records.length) return { inserted: 0 };
  const sheet = getSheet();
  const rows = records.map(recordToRow);
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, COLUMNS.length).setValues(rows);
  return { inserted: rows.length };
}

function rowToRecord(row) {
  const out = {};
  COLUMNS.forEach(function (col, i) {
    const v = row[i];
    out[col] = (v === '' || v === null || v === undefined) ? null : v;
  });
  return out;
}

function recordToRow(r) {
  return COLUMNS.map(function (col) {
    const v = r[col];
    return (v === null || v === undefined) ? '' : v;
  });
}

function selfTest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = '__connection_test_' + Date.now() + '__';
  const results = [];
  let sheet = null;

  function record(check, ok, detail) {
    results.push({ check: check, ok: ok, detail: detail });
  }

  try {
    sheet = ss.insertSheet(name);
    record('createSheet', true, 'created "' + name + '"');

    sheet.getRange(1, 1, 1, 3).setValues([['id', 'value', 'phase']]);
    record('writeHeader', true, '3-column header written');

    sheet.appendRow(['r1', 'initial', new Date().toISOString()]);
    record('append', true, 'row appended');

    const before = sheet.getRange(2, 1, 1, 3).getValues()[0];
    if (before[0] !== 'r1' || before[1] !== 'initial') {
      throw new Error('readback mismatch: ' + JSON.stringify(before));
    }
    record('readRow', true, 'value readback ok');

    sheet.getRange(2, 2).setValue('updated');
    const after = sheet.getRange(2, 2).getValue();
    if (after !== 'updated') throw new Error('update readback got "' + after + '"');
    record('updateCell', true, 'cell update verified');
  } catch (err) {
    record('writeFlow', false, String(err));
  } finally {
    if (sheet) {
      try {
        ss.deleteSheet(sheet);
        record('dropSheet', true, 'temp sheet removed');
      } catch (err) {
        record('dropSheet', false, String(err));
      }
    }
  }

  return { results: results };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
