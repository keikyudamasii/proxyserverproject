const express = require('express');
const path = require('path');
const { handleProxyRequest } = require('./assets/proxy/proxy.js');
const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'assets/index')));
app.use(express.static(path.join(__dirname, 'assets/proxy')));
app.use(express.static(path.join(__dirname, 'assets/youtubedownloader')));

app.set('trust proxy', true);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'assets/index/index.html'));
});

app.get('/fetch', async (req, res) => {
    await handleProxyRequest(req, res, PORT);
});

app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});