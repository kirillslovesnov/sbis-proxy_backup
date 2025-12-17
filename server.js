const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ===== SID CACHE =====
let cachedSid = null;
let sidTime = 0;
const SID_TTL = 10 * 60 * 1000; // 10 минут

// ===== AUTH =====
async function getSid() {
  const LOGIN = process.env.LOGIN;
  const PASSWORD = process.env.PASSWORD;

  console.log('🔐 LOGIN:', LOGIN);

  if (!LOGIN || !PASSWORD) {
    throw new Error('LOGIN или PASSWORD не заданы');
  }

  if (cachedSid && Date.now() - sidTime < SID_TTL) {
    console.log('♻️ Используем кэшированный SID');
    return cachedSid;
  }

  console.log('🔐 Авторизация в SBIS...');

  const response = await axios.post(
    'https://online.saby.ru/auth/service/',
    {
      jsonrpc: '2.0',
      method: 'САП.Аутентифицировать',
      params: {
        login: LOGIN,
        password: PASSWORD
      },
      id: '1'
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    }
  );

  const setCookie = response.headers['set-cookie'];
  if (!setCookie) {
    throw new Error('Set-Cookie не получен');
  }

  const match = setCookie[0].match(/sid=([^;]+)/);
  if (!match) {
    throw new Error('SID не найден в cookie');
  }

  cachedSid = match[1];
  sidTime = Date.now();

  console.log('✅ SID получен');
  return cachedSid;
}

// ===== API =====
app.post('/get-tender', async (req, res) => {
  try {
    const { tenderId } = req.body;

    if (!tenderId) {
      return res.status(400).json({ error: 'Не передан tenderId' });
    }

    const sid = await getSid();

    const response = await axios.post(
      'https://online.saby.ru/tender-api/service/',
      {
        jsonrpc: '2.0',
        method: 'SbisTenderAPI.GetTenderListByID',
        params: {
          TenderID: tenderId
        },
        id: '1'
      },
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cookie': `sid=${sid}`
        }
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== HEALTH =====
app.get('/ping', (req, res) => {
  res.send('pong');
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
