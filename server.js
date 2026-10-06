const express = require('express');
const path = require('path');
const { handleProxyRequest } = require('./proxy/proxy.js');
const app = express();
const PORT = 3000;

app.set('trust proxy', true);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/fetch', async (req, res) => {
    await handleProxyRequest(req, res, PORT);
});

app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});