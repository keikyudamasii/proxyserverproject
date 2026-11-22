const CONSENT_COOKIE_NAME = 'policyConsent';
const YOUTUBE_URL_PATTERN = /^https?:\/\/(www\.|music\.)?(youtube\.com|youtu\.be)\//;
const MAX_CONSOLE_LINES = 200; // ログ行が増えすぎないよう上限を設ける

// Cookieから同意状態を取得する(未同意の場合は null)
const getConsent = () => {
    const cookies = document.cookie.split('; ');
    for (const cookie of cookies) {
        const separator = cookie.indexOf('=');
        const name = cookie.slice(0, separator);
        const value = cookie.slice(separator + 1);
        if (name === CONSENT_COOKIE_NAME) return value;
    }
    return null;
};

// 未同意ならポリシーページへリダイレクトする
document.addEventListener('DOMContentLoaded', () => {
    if (getConsent() !== 'accepted') {
        location.href = '/policy.html';
    }

    const form = document.getElementById('download-form');
    const urlInput = document.getElementById('url-input');
    const downloadButton = document.getElementById('download-button');
    const consoleBox = document.getElementById('console');
    const consoleToolbar = document.getElementById('console-toolbar');
    const copyLogButton = document.getElementById('copy-log-button');

    // サーバーがデバッグモードのときは上限を外し、yt-dlpの全出力を残す
    let maxConsoleLines = MAX_CONSOLE_LINES;

    // ターミナル風ログに1行追記する
    const writeLog = (text, className = '') => {
        consoleBox.hidden = false;
        consoleToolbar.hidden = false;
        const line = document.createElement('div');
        line.textContent = text;
        if (className) line.className = className;
        consoleBox.appendChild(line);
        while (consoleBox.childElementCount > maxConsoleLines) {
            consoleBox.removeChild(consoleBox.firstElementChild);
        }
        consoleBox.scrollTop = consoleBox.scrollHeight;
    };

    // ログ全文をクリップボードへコピーする(不具合報告用)
    copyLogButton.addEventListener('click', async () => {
        const text = Array.from(consoleBox.children)
            .map((line) => line.textContent)
            .join('\n');
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // クリップボードAPIが使えない環境向けのフォールバック
            const area = document.createElement('textarea');
            area.value = text;
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
        }
        copyLogButton.textContent = 'コピーしました';
        setTimeout(() => { copyLogButton.textContent = 'ログをコピー'; }, 2000);
    });

    // フォームを再び使える状態に戻す
    const resetForm = () => {
        urlInput.disabled = false;
        downloadButton.disabled = false;
    };

    // 完成したサーバー側ファイルをブラウザに保存させる
    const finishDownload = (filename) => {
        writeLog('[server] ファイルをダウンロードします...');
        location.href = `/download?file=${encodeURIComponent(filename)}`;
        resetForm();
    };

    // SSEでPython(yt-dlp)の進捗を受信する
    const startDownload = (url) => {
        urlInput.disabled = true;
        downloadButton.disabled = true;
        consoleBox.textContent = '';
        consoleBox.classList.remove('debug');
        consoleToolbar.classList.remove('debug');
        consoleToolbar.hidden = true;
        maxConsoleLines = MAX_CONSOLE_LINES; // 前回のデバッグ設定を引き継がない

        const eventSource = new EventSource(`/download?url=${encodeURIComponent(url)}`);
        eventSource.onmessage = (event) => {
            let output;
            try {
                output = JSON.parse(event.data);
            } catch {
                // JSONでない行はそのままターミナル風に表示
                writeLog(event.data);
                return;
            }
            if (output.status === 'debug') {
                // デバッグ時は行数制限を外す(先頭の抽出ログが消えないように)
                maxConsoleLines = Infinity;
                consoleBox.classList.add('debug');
                consoleToolbar.classList.add('debug');
                writeLog(`[server] ${output.message}`);
            } else if (output.status === 'done') {
                eventSource.close();
                finishDownload(output.filename);
            } else if (output.status === 'error') {
                eventSource.close();
                // ヒント文が続く場合は改行ごとに表示する
                for (const line of String(output.message).split('\n')) {
                    writeLog(`[error] ${line}`, 'error');
                }
                resetForm();
            }
        };
        eventSource.onerror = () => {
            // 接続が切れた場合は完了イベントが受信できていないので、フォームだけ戻す
            eventSource.close();
            resetForm();
        };
    };

    form.addEventListener('submit', (event) => {
        event.preventDefault(); // 標準のフォーム送信は使わずSSEで実況表示する
        const url = urlInput.value.trim();
        if (!YOUTUBE_URL_PATTERN.test(url)) {
            writeLog('[error] YouTubeのURLを入力してください。', 'error');
            return;
        }
        startDownload(url);
    });
});
