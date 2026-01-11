const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

const KEY_FILE = path.join(process.cwd(), "service-account.json");
const SPREADSHEET_ID = "1gS46okY36V86bDdvUEaaH_mu3ZHcvFgJKr-dooPMh1s";

/**
 * Авторизация в Google Sheets
 */
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

/**
 * Добавляет результаты тендера в Google Sheets
 * @param {Object} tenderData — ответ от СБИС
 */
async function appendTenderResultToExcel(tenderData) {
  const sheets = await getSheetsClient();
  const tender = tenderData?.result?.tenders?.[0];
  if (!tender) throw new Error("Неверный формат данных от СБИС");

  const rows = [];

  // 🔹 Основная строка тендера
  rows.push([
    tender.number,
    tender.name,
    tender.status,
    tender.type,
    tender.region,
    tender.initiator_name,
    tender.organizer_name,
    tender.price,
    tender.publish_date,
    tender.request_receiving_date,
    tender.tender_date,
    tender.lots?.[0]?.delivery_term || "",
    tender.win_price,
    tender.winner_name,
    tender.winner_inn,
    tender.smp,
    tender.lots?.[0]?.contract_number || "",
    "", "", "", "", "", ""
  ]);

  // 🔹 Вложенные товары
  for (const lot of tender.lots || []) {
    const lotPrice = lot.price || 0;
    for (const item of lot.items || []) {
      const quantity = item.quantity || 0;
      const unitPrice = quantity ? lotPrice / quantity : 0;
      const ktru = item.ktru_code || "";
      const okpd2 = (item.okpd2 && item.okpd2[0]?.code) || "";

      rows.push([
        "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
        lot.name, unitPrice, quantity, lotPrice, ktru, okpd2
      ]);
    }
  }

  // 🔹 Добавляем строки в таблицу
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "A:Z",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    resource: { values: rows },
  });

  console.log(`✅ Тендер ${tender.number} успешно добавлен в Google Sheets.`);
}

module.exports = { appendTenderResultToExcel };
