import { google } from "googleapis";
import axios from "axios";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
dayjs.extend(customParseFormat);

const SHEET_ID = "1gS46okY36V86bDdvUEaaH_mu3ZHcvFgJKr-dooPMh1s";
const SHEET_NAME = "Tenders";
const API_URL = "http://localhost:10000/get-tender"; // твой локальный API

const auth = new google.auth.GoogleAuth({
  keyFile: "./service-account.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

async function checkForUpdates() {
  console.log("🔍 Проверка тендеров на обновление...");

  // Считываем все строки из таблицы
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:K`,
  });

  const rows = data.values || [];
  if (rows.length <= 1) {
    console.log("Нет данных для проверки.");
    return;
  }

  // Пропускаем заголовок, начинаем с 2-й строки
  for (let i = 1; i < rows.length; i++) {
    const [number, , , , , , , , , requestDate] = rows[i];
    if (!number || !requestDate) continue;

    // requestDate = "02.10.2025 6:22:22"
    const parsed = dayjs(requestDate.split(" ")[0], "DD.MM.YYYY");
    if (!parsed.isValid()) continue;

    const diff = dayjs().diff(parsed, "day");
    if (diff >= 14) {
      console.log(`♻️ Тендер ${number}: прошло ${diff} дней, обновляем...`);
      try {
        await axios.post(API_URL, { tenderId: number });
      } catch (err) {
        console.error(`❌ Ошибка при обновлении тендера ${number}:`, err.message);
      }
    } else {
      console.log(`⏳ Тендер ${number}: прошло ${diff} дней, пока рано.`);
    }
  }

  console.log("✅ Проверка завершена.");
}

checkForUpdates();
