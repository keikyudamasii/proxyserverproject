const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'log');

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

module.exports = { writeLog, getClientIp, getLogFilePath };
