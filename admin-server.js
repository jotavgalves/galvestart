require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const PORT = Number(process.env.ADMIN_PORT || 3001);
const API_BASE = process.env.APP_URL || 'http://localhost:3000';

app.get('/config.js', (req, res) => {
  res.type('application/javascript').send(`window.GALVESTART_API_BASE=${JSON.stringify(API_BASE)};`);
});
app.use(express.static(path.join(__dirname, 'admin'), { extensions: ['html'] }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));
app.listen(PORT, () => console.log(`GALVESTART painel separado: http://localhost:${PORT}`));
