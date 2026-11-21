const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');
const { writeLog, getClientIp, cleanupOldLogs } = require('./logger');
// プロキシサービスは一時停止中のため読み込みも停止中(再開時はコメントアウトを外す)
// const { handleProxyRequest } = require('./assets/proxy/proxy-handler');

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const YOUTUBE_URL_PATTERN = /^https?:\/\/(www\.|music\.)?(youtube\.com|youtu\.be)\//;
const YOUTUBE_DOWNLOADER = path.join(__dirname, 'assets', 'youtubedownloader', 'youtubedownloader.py');
// pip --target で入れたPythonパッケージ(yt-dlp等)の置き場。無くても害はない
const PYDEPS_DIR = path.join(__dirname, '.pydeps');

const app = express();
// PaaS(Render等)はPORTを環境変数で指定する。未指定ならローカル用の3000番
const PORT = Number(process.env.PORT) || 3000;
// Pythonの実行ファイル名: Windowsは python、Linux(Render等)は python3 が一般的
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
// 中断されたダウンロードの残骸を起動時に掃除する閾値(6時間)
const CLEANUP_MAX_AGE_MS = 6 * 60 * 60 * 1000;

app.set('trust proxy', true);

// 起動時に前回の残骸(ブラウザ切断などで配信されなかったファイル)を掃除する
const cleanupOldDownloads = () => {
    try {
        if (!fs.existsSync(DOWNLOADS_DIR)) return;
        const now = Date.now();
        for (const name of fs.readdirSync(DOWNLOADS_DIR)) {
            const filepath = path.join(DOWNLOADS_DIR, name);
            try {
                const stat = fs.statSync(filepath);
                if (stat.isFile() && now - stat.mtimeMs > CLEANUP_MAX_AGE_MS) {
                    fs.unlinkSync(filepath);
                }
            } catch (e) {}
        }
    } catch (e) {}
};
cleanupOldDownloads();

// プライバシーポリシーの保管期間(21日)を過ぎたログを削除する
cleanupOldLogs();
// 起動しっぱなしでも古いログが残らないよう、1日1回チェックする
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

// HTMLページの遷移だけをアクセスログに残す(CSS/JS/画像や/download等のAPIは除外)
// staticより前に登録しないと、staticが応答してログ処理まで届かない
const isHtmlPageRequest = (req) => {
    if (req.method !== 'GET') return false;
    return req.path === '/' || req.path.endsWith('.html');
};

app.use((req, res, next) => {
    if (!isHtmlPageRequest(req)) return next();
    res.on('finish', () => {
        writeLog('access', {
            ip: getClientIp(req),
            url: req.originalUrl,
            referrer: req.get('Referer') || undefined,
            status: res.statusCode
        });
    });
    next();
});

// 公開してよい拡張子だけを静的配信する
// (.py / .exe / .dll / .txt など、サーバー側のファイルは404にする)
const PUBLIC_EXTENSIONS = new Set([
    '.html', '.css', '.js',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
    '.woff', '.woff2', '.ttf'
]);
app.use((req, res, next) => {
    // エンコード(%2Epy など)で拡張子チェックを回避されないようデコードしてから判定する
    let pathname = req.path;
    try { pathname = decodeURIComponent(pathname); } catch (e) {}
    const ext = path.extname(pathname).toLowerCase();
    // 拡張子なし(/ や /download など)は各ルートで処理する
    if (!ext || PUBLIC_EXTENSIONS.has(ext)) return next();
    return res.status(404).send('Not Found');
});

// 静的ファイル配信(ログ処理の後に登録する)
app.use(express.static(path.join(__dirname, 'assets/index')));
app.use(express.static(path.join(__dirname, 'assets/proxy')));
app.use(express.static(path.join(__dirname, 'assets/youtubedownloader')));
app.use(express.static(path.join(__dirname, 'assets/policy')));

// policy「了解した」ボタンから送られる同意の記録
app.post('/log/policy-accept', (req, res) => {
    writeLog('policy-accept', {
        ip: getClientIp(req),
        url: '/policy.html',
        status: 200
    });
    res.sendStatus(200);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'assets/index/index.html'));
});

// プロキシサービスは一時停止中のため /fetch API を無効化(再開時はコメントアウトを外す)
// app.get('/fetch', async (req, res) => {
//     await handleProxyRequest(req, res);
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
        writeLog('download-file', { ip: getClientIp(req), file: file, status: 200 });
        // 配信が完了したら削除する(サーバーのディスクを圧迫しないため)
        return res.download(filepath, path.basename(filepath), (err) => {
            if (!err) fs.unlink(filepath, () => {});
        });
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

    writeLog('download-start', { ip: getClientIp(req), url: url });

    // 接続が閉じているか(正常終了・クライアント切断の両方)
    const isClosed = () => res.writableEnded || res.destroyed;

    // プロキシ側のアイドルタイムアウト対策。SSEのコメント行なのでクライアントには表示されない
    const heartbeat = setInterval(() => {
        if (!isClosed()) res.write(': ping\n\n');
    }, 15000);

    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        clearInterval(heartbeat);
        if (!res.writableEnded) res.end();
    };

    // pip --target で入れたパッケージをPythonが見つけられるよう、絶対パスでPYTHONPATHに追加する
    const proc = spawn(PYTHON_BIN, [YOUTUBE_DOWNLOADER, url, DOWNLOADS_DIR], {
        env: {
            ...process.env,
            PYTHONPATH: [PYDEPS_DIR, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)
        }
    });

    // Pythonが見つからない等でプロセスを起動できなかった場合(未処理だとサーバーごと落ちる)
    let spawnFailed = false;
    proc.on('error', (error) => {
        spawnFailed = true;
        writeLog('download-error', { ip: getClientIp(req), url: url, note: error.message });
        if (!isClosed()) {
            res.write(`data: ${JSON.stringify({ status: 'error', message: `実行環境のエラー: ${error.message}` })}\n\n`);
        }
        finish();
    });

    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
        if (line.length && !isClosed()) res.write(`data: ${line}\n\n`);
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
        if (spawnFailed) return; // 'error' 側で処理済み
        writeLog('download-end', {
            ip: getClientIp(req),
            url: url,
            note: code === 0 ? 'exit code 0 (成功)' : `exit code ${code} (異常終了)`
        });
        // python側がJSONでエラーを通知している場合はスクリプトが処理するので、文字通りの異常終了だけ補足する
        if (code !== 0 && stderr.trim() && !isClosed()) {
            const lastLine = stderr.trim().split('\n').pop();
            res.write(`data: [python] ${lastLine}\n\n`);
        }
        finish();
    });

    // クライアントが切断したらpythonを停止する(resのcloseは切断時に発火する)
    res.on('close', () => {
        clearInterval(heartbeat);
        if (!finished) proc.kill();
    });
});

// 0.0.0.0 で待ち受ける(コンテナ/PaaSから外部アクセスできるようにする)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Proxy server running on port ${PORT}`);
});