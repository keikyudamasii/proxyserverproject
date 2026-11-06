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

    // ターミナル風ログに1行追記する
    const writeLog = (text, className = '') => {
        consoleBox.hidden = false;
        const line = document.createElement('div');
        line.textContent = text;
        if (className) line.className = className;
        consoleBox.appendChild(line);
        while (consoleBox.childElementCount > MAX_CONSOLE_LINES) {
            consoleBox.removeChild(consoleBox.firstElementChild);
        }
        consoleBox.scrollTop = consoleBox.scrollHeight;
    };

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
            if (output.status === 'done') {
                eventSource.close();
                finishDownload(output.filename);
            } else if (output.status === 'error') {
                eventSource.close();
                writeLog(`[error] ${output.message}`, 'error');
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
