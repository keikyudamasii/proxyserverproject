const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const PORT = 3000;

app.set('trust proxy', true);

const LOG_FILE_PATH = path.join(__dirname, 'log/log.log');

const writeLog = (clientIp, targetUrl, status) => {
  const utcTimestamp = new Date().toISOString();
  const logMessage = `[${utcTimestamp}] IP: ${clientIp} | Requested URL: ${targetUrl || 'N/A'} | Status: ${status}\n`;
  fs.appendFile(LOG_FILE_PATH, logMessage, () => {});
};

app.get('/fetch', async (req, res) => {
  const targetUrl = req.query.url;
  const rawIp = req.ip || req.socket.remoteAddress || '';
  const clientIp = rawIp.replace(/^.*:/, '') || 'Unknown';

  if (!targetUrl) {
    writeLog(clientIp, targetUrl, 400);
    return res.status(400).send('エラー: クエリパラメーター "url" を指定してください。');
  }

  try {
    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    });

    writeLog(clientIp, targetUrl, response.status);

    const contentType = response.headers['content-type'] || '';
    res.status(response.status);

    const proxyBase = `http://localhost:${PORT}/fetch`;

    // 1. HTMLの場合の処理
    if (contentType.includes('text/html')) {
      const htmlString = response.data.toString('utf-8');
      const $ = cheerio.load(htmlString);

      // href 属性の書き換え
      $('[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.startsWith('data:') && !href.startsWith('#') && !href.startsWith('javascript:')) {
          try {
            // targetUrl を基準にして絶対パスを算出
            const absoluteUrl = new URL(href, targetUrl).href;
            $(el).attr('href', `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`);
          } catch (e) {}
        }
      });

      // src 属性の書き換え
      $('[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src && !src.startsWith('data:')) {
          try {
            const absoluteUrl = new URL(src, targetUrl).href;
            $(el).attr('src', `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`);
          } catch (e) {}
        }
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send($.html());
    }

    // 2. CSSの場合（CSS内の url(...) をプロキシ用に書き換え）
    if (contentType.includes('text/css')) {
      let cssString = response.data.toString('utf-8');
      cssString = cssString.replace(/url\((['"]?)([^'"]+)\1\)/g, (match, quote, relUrl) => {
        if (relUrl.startsWith('data:') || relUrl.startsWith('http://') || relUrl.startsWith('https://')) {
          return match;
        }
        try {
          const absoluteUrl = new URL(relUrl, targetUrl).href;
          return `url(${quote}${proxyBase}?url=${encodeURIComponent(absoluteUrl)}${quote})`;
        } catch (e) {
          return match;
        }
      });

      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      return res.send(cssString);
    }

    // 3. その他の静的ファイル（画像・JavaScript等）はそのまま返す
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    res.send(response.data);

  } catch (error) {
    console.error('Proxy Error:', error.message);
    writeLog(clientIp, targetUrl, 500);
    res.status(500).send('プロキシ処理中にエラーが発生しました。');
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});