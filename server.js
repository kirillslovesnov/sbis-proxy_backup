import cron from "node-cron";
import { google } from "googleapis";
import { appendTenderResultToExcel } from "./excel-writer.js";
import axios from "axios";
import dotenv from "dotenv";
import express from "express";

dotenv.config({ path: "./.env" });

const app = express();
const PORT = 10001;

const SPREADSHEET_ID = "1gS46okY36V86bDdvUEaaH_mu3ZHcvFgJKr-dooPMh1s";
const SHEET_DATA = "Data";
const SHEET_TENDERS = "Tenders";
const SHEET_TENDERS_NO_PRODUCTS = "Tenders (no products)";

/* ================= AUTH (SID получение) ================= */

let cachedSid = null;
let sidTime = 0;
const SID_TTL = 10 * 60 * 1000; // 10 минут

async function getSid() {
  const LOGIN = process.env.LOGIN;
  const PASSWORD = process.env.PASSWORD;

  if (!LOGIN || !PASSWORD) throw new Error("LOGIN или PASSWORD не заданы в .env");

  if (cachedSid && Date.now() - sidTime < SID_TTL) {
    return cachedSid;
  }

  const response = await axios.post(
    "https://online.saby.ru/auth/service/",
    {
      jsonrpc: "2.0",
      method: "САП.Аутентифицировать",
      params: { login: LOGIN, password: PASSWORD },
      id: 1,
    },
    {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }
  );

  const cookies = response.headers["set-cookie"];
  if (!cookies) throw new Error("Set-Cookie не получен");

  const sidCookie = cookies.find((c) => c.startsWith("sid="));
  if (!sidCookie) throw new Error("SID не найден в cookie");

  cachedSid = sidCookie.match(/sid=([^;]+)/)[1];
  sidTime = Date.now();
  return cachedSid;
}

/* ================= Google Sheets ================= */

const auth = new google.auth.GoogleAuth({
  keyFile: "./service-account.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

/* ================= Умная пауза между операциями ================= */

async function safeWrite(callback, delay = 2000) {
  try {
    await callback();
  } catch (err) {
    console.error("⚠️ Ошибка при записи в Sheets:", err.message);
  }
  // обязательная пауза между запросами к Google API
  await new Promise((res) => setTimeout(res, delay));
}

/* ================= CRON ================= */

// 🕓 Запуск каждый день в 04:00 по Москве (01:00 UTC)
cron.schedule("0 1 * * *", async () => {
  console.log("🕓 [Cron] Ежедневная проверка Data начата:", new Date().toLocaleString());

  try {
    // 1️⃣ Загружаем номера тендеров и статусы (A и AU)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_DATA}!A:AU`,
    });

    const rows = res.data.values || [];
    rows.shift(); // убираем заголовки
    const tenders = rows.map((row, i) => ({
      row: i + 2,
      number: row[0]?.trim(),
      status: row[46]?.trim() || "",
    }));

    const unprocessed = tenders.filter(
      (t) => t.number && t.status.toLowerCase() !== "добавлено"
    );

    if (unprocessed.length === 0) {
      console.log("✅ Все тендеры уже обработаны. Завершение.");
      return;
    }

    const toProcess = unprocessed.slice(0, 190);
    console.log(`📦 Найдено ${toProcess.length} необработанных тендеров.`);

    const sid = await getSid();

    for (const [index, t] of toProcess.entries()) {
      console.log(`🔍 (${index + 1}/${toProcess.length}) Обработка тендера ${t.number}...`);

      try {
        const response = await axios.post(
          "https://online.saby.ru/tender-api/service/",
          {
            jsonrpc: "2.0",
            protocol: 4,
            method: "SbisTenderAPI.GetTenderListByNumber",
            params: { params: { number: t.number } },
            id: 1,
          },
          {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              Cookie: `sid=${sid}`,
            },
          }
        );

        await appendTenderResultToExcel(response.data);

        await safeWrite(() =>
          sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_DATA}!AU${t.row}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [["добавлено"]] },
          })
        );

        console.log(`✅ Тендер ${t.number} добавлен и помечен как "добавлено".`);
      } catch (err) {
        console.error(`❌ Ошибка при тендере ${t.number}:`, err.message);

        // AU = "ошибка" в Data
        await safeWrite(() =>
          sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_DATA}!AU${t.row}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [["ошибка"]] },
          })
        );

        // Добавление строки с ошибкой в Tenders и Tenders (no products)
        const errorRow = Array(47).fill("ошибка");
        errorRow[0] = t.number;

        await safeWrite(() =>
          sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_TENDERS}!A:AU`,
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            requestBody: { values: [errorRow] },
          })
        );

        await safeWrite(() =>
          sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_TENDERS_NO_PRODUCTS}!A:AU`,
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            requestBody: { values: [errorRow] },
          })
        );

        console.log(`⚠️ Ошибка записана в Tenders и Tenders (no products) для ${t.number}.`);
      }
    }

    console.log("🏁 [Cron] Обработка Data завершена:", new Date().toLocaleString());
  } catch (err) {
    console.error("❌ Ошибка в cron-задаче:", err.message);
  }
});

/* ================= API (ручной тест) ================= */

app.use(express.json());

app.post("/get-tender", async (req, res) => {
  try {
    const { tenderId } = req.body;
    const sid = await getSid();

    const response = await axios.post(
      "https://online.saby.ru/tender-api/service/",
      {
        jsonrpc: "2.0",
        protocol: 4,
        method: "SbisTenderAPI.GetTenderListByNumber",
        params: { params: { number: tenderId } },
        id: 1,
      },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Cookie: `sid=${sid}`,
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SBIS proxy запущен на порту ${PORT}`);
});
