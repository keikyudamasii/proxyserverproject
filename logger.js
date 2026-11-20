const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'log');
const LOG_FILE_PATH = path.join(LOG_DIR, 'log.log');

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

// log/log.log に追記する(Render等のコンソールにも同じ行を出力する)
const writeLog = (event, fields = {}) => {
    const line = formatLog(event, fields);
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFile(LOG_FILE_PATH, line + '\n', () => {});
    } catch (e) {}
    console.log(line);
};

module.exports = { writeLog, getClientIp, LOG_FILE_PATH };
