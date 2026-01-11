import { google } from "googleapis";
import fs from "fs";

const SPREADSHEET_ID = "1gS46okY36V86bDdvUEaaH_mu3ZHcvFgJKr-dooPMh1s";
const SHEET_TENDERS = "Tenders";
const SHEET_TENDERS_NO_PRODUCTS = "Tenders (no products)";

// Авторизация
const auth = new google.auth.GoogleAuth({
  keyFile: "./service-account.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value.replace(" ", "T"));
  if (isNaN(d)) {
    const parts = value.split(/[.\s:]/);
    if (parts.length >= 3) {
      const [day, month, year] = parts;
      return `${year}-${month}-${day}`;
    }
    return value;
  }
  return d.toISOString().split("T")[0];
}

/**
 * Добавляет результаты тендера в Google Sheets
 * @param {Object} tenderData — ответ от СБИС
 */
export async function appendTenderResultToExcel(tenderData) {
  const tender = tenderData?.result?.tenders?.[0];
  if (!tender) throw new Error("Неверный формат данных от СБИС");

  // ⚠️ Пропускаем тендеры с суффиксами "_1", "_2" и т.п.
  if (/_\d+$/.test(tender.number)) {
    console.log(`⚠️ Пропуск тендера ${tender.number} (вспомогательное извещение СБИС)`);
    return;
  }

  // Проверяем дубли по номеру тендера
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TENDERS}!A:A`,
  });

  const existingNumbers = (existing.data.values || []).flat().map(v => v?.toString().trim());
  if (existingNumbers.includes(tender.number)) {
    console.log(`⏩ Тендер ${tender.number} уже существует — пропуск.`);
    return;
  }

  const values = [];

  // 🧾 Основная строка тендера
  const tenderRow = [
    tender.number,
    tender.name,

    "", // Метка
    "", // Участник
    "", // Тип продукта

    tender.status,
    tender.type,
    tender.region,
    tender.initiator_name,
    tender.organizer_name,
    tender.price,
    formatDate(tender.publish_date),
    formatDate(tender.request_receiving_date),
    formatDate(tender.tender_date),
    tender.lots?.[0]?.delivery_term || "",
    tender.win_price,
    tender.winner_name,
    tender.winner_inn,
    tender.smp || "",
    tender.lots?.[0]?.contract_number || "",
    tender.tender_url
      ? `=HYPERLINK("${tender.tender_url}"; "Открыть в ЕИС")`
      : "",
    "", "", "", "", "", "", // запас под доп. столбцы
  ];

  values.push(tenderRow);

  // 🧩 Вложенные строки (лоты и товары)
  for (const lot of tender.lots || []) {
    for (const item of lot.items || []) {
      const lotRow = [
        "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
        `→ ${item.name}`,
        item.price / item.quantity || "",
        item.quantity || "",
        lot.price || "",
        item.ktru_code || "",
        item.okpd2?.[0]?.code || "",
      ];
      values.push(lotRow);
    }
  }

  // ✍️ Запись в основной лист
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TENDERS}!A:AA`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });

  console.log(`✅ Тендер ${tender.number} добавлен в лист "${SHEET_TENDERS}".`);

  // ✍️ Дублирование без лотов в "Tenders (no products)"
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TENDERS_NO_PRODUCTS}!A:AA`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [tenderRow] }, // только первая строка
  });

  console.log(`📄 Тендер ${tender.number} также добавлен в "${SHEET_TENDERS_NO_PRODUCTS}".`);
}