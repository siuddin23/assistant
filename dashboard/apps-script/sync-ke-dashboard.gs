/**
 * Sinkron spreadsheet DATABASE HARYS -> Glowlab Dashboard.
 *
 * Cara pasang (sekali):
 * 1. Buka spreadsheet -> Extensions / Ekstensi -> Apps Script.
 * 2. Hapus isi Code.gs, tempel seluruh file ini, lalu isi DASHBOARD_URL dan INGEST_TOKEN di bawah.
 * 3. Pilih fungsi "pasangJadwal" di toolbar, klik Run, lalu izinkan akses (Review permissions -> Allow).
 *    Ini menjalankan sinkron pertama dan memasang jadwal otomatis setiap jam.
 * Sinkron manual kapan saja: pilih fungsi "sinkronSekarang" -> Run, atau menu "Dashboard" di spreadsheet.
 */
const DASHBOARD_URL = "https://GANTI-DENGAN-URL-VERCEL.vercel.app";
const INGEST_TOKEN = "GANTI-DENGAN-INGEST_TOKEN";

const BULAN = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];

/** Kirim tab bulan ini dan bulan lalu (order bulan lalu masih bisa berubah status/resi). */
function sinkronSekarang() {
  const now = new Date();
  const tabs = [BULAN[(now.getMonth() + 11) % 12], BULAN[now.getMonth()]];
  const hasil = tabs.map(kirimTab);
  Logger.log(hasil.join("\n"));
  return hasil.join("\n");
}

function kirimTab(nama) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nama);
  if (!sheet) return nama + ": tab tidak ada, dilewati";
  // getDisplayValues: kirim teks persis seperti yang terlihat (tanggal dd/mm/yyyy, Rp, dll.)
  const values = sheet.getRange(1, 1, sheet.getLastRow(), Math.min(sheet.getLastColumn(), 43)).getDisplayValues();
  const res = UrlFetchApp.fetch(DASHBOARD_URL.replace(/\/$/, "") + "/api/ingest/sheet", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + INGEST_TOKEN },
    payload: JSON.stringify({ tab: nama, values: values }),
    muteHttpExceptions: true,
  });
  return nama + ": " + res.getResponseCode() + " " + res.getContentText().slice(0, 300);
}

function pasangJadwal() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "sinkronSekarang"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("sinkronSekarang").timeBased().everyHours(1).create();
  return sinkronSekarang();
}

/** Menu "Dashboard" di spreadsheet untuk sinkron manual. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Dashboard").addItem("Sinkron sekarang", "menuSinkron").addToUi();
}

function menuSinkron() {
  SpreadsheetApp.getUi().alert(sinkronSekarang());
}
