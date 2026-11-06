const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');
// プロキシサービスは一時停止中のため読み込みも停止中(再開時はコメントアウトを外す)
// const { handleProxyRequest } = require('./assets/proxy/proxy-handler');

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const YOUTUBE_URL_PATTERN = /^https?:\/\/(www\.|music\.)?(youtube\.com|youtu\.be)\//;
const YOUTUBE_DOWNLOADER = path.join(__dirname, 'assets', 'youtubedownloader', 'youtubedownloader.py');

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

// YouTubeダウンローダー(yt-dlp): ?url= はSSEで進捗配信、?file= は完成ファイルの配信
app.get('/download', (req, res) => {
    // ?file= : 完了したファイルをブラウザへ送る
    const file = req.query.file;
    if (file) {
        // ファイル名は DOWNLOADS_DIR 直下のみ許可(パス遷移を防ぐ)
        if (typeof file !== 'string' || file.includes('/') || file.includes('\\') || file.startsWith('.')) {
            return res.status(400).send('エラー: 不正なファイル名です。');
        }
        const filepath = path.join(DOWNLOADS_DIR, file);
        if (!fs.existsSync(filepath)) {
            return res.status(404).send('エラー: ファイルが見つかりません。');
        }
        return res.download(filepath, path.basename(filepath));
    }

    // ?url= : Python(yt-dlp)を起動し、標準出力を1行ずつ実況配信する
    const url = req.query.url;
    if (typeof url !== 'string' || !YOUTUBE_URL_PATTERN.test(url)) {
        return res.status(400).send('エラー: YouTubeのURLのみ指定できます。');
    }

    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    res.write('data: [server] ダウンロードを開始します...\n\n');

    const proc = spawn('python', [YOUTUBE_DOWNLOADER, url, DOWNLOADS_DIR]);

    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
        if (line.length) res.write(`data: ${line}\n\n`);
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
        // python側がJSONでエラーを通知している場合はスクリプトが処理するので、文字通りの異常終了だけ補足する
        if (code !== 0 && stderr.trim()) {
            const lastLine = stderr.trim().split('\n').pop();
            res.write(`data: [python] ${lastLine}\n\n`);
        }
        res.end();
    });

    // クライアントが切断したらpythonを停止する
    req.on('close', () => proc.kill());
});

app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});