const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Позволяет вашему сайту делать запросы к этому серверу

const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // Ваш ID, куда придут уведомления

app.post('/notify', async (req, res) => {
    try {
        const { message } = req.body;
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        
        await axios.post(url, {
            chat_id: ADMIN_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        
        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка отправки в Телеграм' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy server running on port ${PORT}`));
