const express = require('express');
const path = require('path');
// プロキシサービスは一時停止中のため読み込みも停止中(再開時はコメントアウトを外す)
// const { handleProxyRequest } = require('./assets/proxy/proxy-handler');
const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'assets/index')));
app.use(express.static(path.join(__dirname, 'assets/proxy')));
app.use(express.static(path.join(__dirname, 'assets/youtubedownloader')));
app.use(express.static(path.join(__dirname, 'assets/policy')));

app.set('trust proxy', true);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'assets/index/index.html'));
});

// プロキシサービスは一時停止中のため /fetch API を無効化(再開時はコメントアウトを外す)
// app.get('/fetch', async (req, res) => {
//     await handleProxyRequest(req, res, PORT);
// });

app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});