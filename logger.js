const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'log');
// プライバシーポリシーの「3週間保管」に合わせる
const LOG_RETENTION_DAYS = 21;
const DATE_LOG_PATTERN = /^(\d{4})-(\d{2})-(\d{2})\.log$/;

// ローカル日付を YYYY-MM-DD 形式で返す(日付ごとのログファイル名に使う)
const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// その日のログファイルパス(例: log/2026-11-21.log)。日付が変われば自動で切り替わる
const getLogFilePath = (date = new Date()) => path.join(LOG_DIR, `${formatDate(date)}.log`);

// リクエスト送信元のIPを取得する(::ffff: 表記を取り除く)
const getClientIp = (req) => {
    const rawIp = req.ip || (req.socket && req.socket.remoteAddress) || '';
    return rawIp.replace(/^::ffff:/, '') || 'Unknown';
};

// 既存形式を拡張した1行ログを組み立てる
// [日時] IP: x.x.x.x | Event: access | URL: /path | From: /referrer | File: name | Status: 200 | Note: 任意
const formatLog = (event, fields) => {
    const parts = [`[${new Date().toISOString()}]`];
    if (fields.ip) parts.push(`IP: ${fields.ip}`);
    parts.push(`Event: ${event}`);
    if (fields.url) parts.push(`URL: ${fields.url}`);
    if (fields.referrer) parts.push(`From: ${fields.referrer}`);
    if (fields.file) parts.push(`File: ${fields.file}`);
    if (fields.status !== undefined) parts.push(`Status: ${fields.status}`);
    if (fields.note) parts.push(`Note: ${fields.note}`);
    return parts[0] + ' ' + parts.slice(1).join(' | ');
};

// 「その日の日付.log」に追記する(ファイルが無ければ作成する)
// あわせてコンソール(Render等のログ)にも同じ行を出力する
const writeLog = (event, fields = {}) => {
    const line = formatLog(event, fields);
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        // flag: 'a' はファイルが無ければ作成する
        fs.appendFile(getLogFilePath(), line + '\n', { flag: 'a' }, () => {});
    } catch (e) {}
    console.log(line);
};

// 保管期間(21日)を過ぎた日付ログを削除する
const cleanupOldLogs = () => {
    let names;
    try {
        names = fs.readdirSync(LOG_DIR);
    } catch (e) {
        return; // ログフォルダが無ければ何もしない
    }
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const name of names) {
        const match = DATE_LOG_PATTERN.exec(name);
        if (!match) continue;
        // ファイル名の日付(ローカル時刻の0時)が保管期間より古ければ削除
        const fileDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        if (Number.isNaN(fileDate.getTime())) continue;
        if (fileDate.getTime() < cutoff) {
            try {
                fs.unlinkSync(path.join(LOG_DIR, name));
            } catch (e) {}
        }
    }
};

module.exports = { writeLog, getClientIp, getLogFilePath, cleanupOldLogs, LOG_RETENTION_DAYS };
