const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ✅ Настройки авторизации
const LOGIN = process.env.LOGIN;
const PASSWORD = process.env.PASSWORD;


// 🔐 SID кэшируем на 10 минут
let cachedSid = null;
let sidTimestamp = 0;

async function getSid() {
  const now = Date.now();
  if (cachedSid && now - sidTimestamp < 10 * 60 * 1000) {
    console.log('✅ Используем кэшированный SID');
    return cachedSid;
  }

  try {
    console.log('🔐 Авторизация в SBIS...');
    const response = await axios.post('https://online.saby.ru/auth/service/', {
      jsonrpc: "2.0",
      method: "САП.Аутентифицировать",
      params: { login: LOGIN, password: PASSWORD },
      id: 1
    }, {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });

    const setCookie = response.headers['set-cookie']?.[0];
    const sidMatch = setCookie?.match(/sid=([^;]+)/);
    if (!sidMatch) throw new Error("❌ SID не найден");

    cachedSid = sidMatch[1];
    sidTimestamp = now;
    console.log('✅ SID получен:', cachedSid);
    return cachedSid;

  } catch (error) {
    console.error('❌ Ошибка авторизации:', error.message);
    throw new Error('Ошибка авторизации в SBIS');
  }
}

// 🚀 Эндпоинт для получения закупки по ID
app.post('/get-tender', async (req, res) => {
  const tenderId = req.body.tenderId;

  if (!tenderId) {
    return res.status(400).json({ error: 'Не передан tenderId' });
  }

  try {
    const sid = await getSid();

    const response = await axios.post('https://online.saby.ru/tender-api/service/', {
      jsonrpc: "2.0",
      method: "SbisTenderAPI.GetTenderListByID",
      params: { TenderID: tenderId },
      id: 1
    }, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cookie': `sid=${sid}`
      }
    });

    console.log('✅ Данные получены для ID:', tenderId);
    res.json(response.data);

  } catch (error) {
    console.error('❌ Ошибка при запросе:', error.message);
    res.status(500).json({ error: 'Ошибка при получении данных о закупке' });
  }
});

// 🧪 Проверка "жив ли сервер"
app.get('/ping', (req, res) => {
  res.send('pong');
});

// 🌐 Слушаем порт от Render или локальный
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
