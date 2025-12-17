// server.js

const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

app.post('/get-tender', async (req, res) => {
  const { tenderId } = req.body;

  const sid = await getSid();
  if (!sid) {
    return res.status(500).json({ error: 'Ошибка авторизации в SBIS' });
  }

  try {
    const response = await axios.post(
      'https://zakupki.sbis.ru/contract/public/api/v2/Search/GetPurchase',
      { purchaseId: tenderId },
      { headers: { Cookie: 'sid=' + sid } }
    );

    res.json(response.data);
  } catch (error) {
    console.error('❌ Ошибка при получении данных о закупке:', error.message);
    res.status(500).json({ error: 'Ошибка при получении данных о закупке' });
  }
});

app.listen(PORT, () => {
  console.log('🚀 Сервер запущен на http://localhost:' + PORT);
});

// 🔐 Получение SID через API СБИС
async function getSid() {
  const LOGIN = process.env.LOGIN;
  const PASSWORD = process.env.PASSWORD;

  console.log("🔐 LOGIN:", LOGIN);
  console.log("🔐 PASSWORD:", PASSWORD);

  try {
    const response = await axios.post(
      'https://online.sbis.ru/auth/service/',
      {
        jsonrpc: '2.0',
        protocol: 4,
        method: 'СБИС.Аутентификация.Войти',
        params: {
          login: LOGIN,
          password: PASSWORD
        },
        id: 1
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const sid = response.data?.result?.sid;
    if (!sid) {
      console.error('❌ Ошибка авторизации: ❌ SID не найден');
      console.error('Ответ от СБИС:', response.data);
      return null;
    }

    console.log('✅ SID получен');
    return sid;
  } catch (error) {
    console.error('❌ Ошибка при запросе:', error.response?.data || error.message);
    return null;
  }
}
