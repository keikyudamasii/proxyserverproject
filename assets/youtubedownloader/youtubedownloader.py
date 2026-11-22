import sys
import os
import glob
import json
import re
import shutil
import subprocess
from importlib.metadata import PackageNotFoundError, version as package_version

import yt_dlp

# 使い方: python youtubedownloader.py <YouTube URL> <保存先フォルダ>
# 進捗を標準出力にターミナル風の1行ずつ出力し、最終状態はJSONで通知する
# (Node.js側の /download がSSEでブラウザへ中継する)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FFMPEG_DIR = os.path.join(BASE_DIR, "ffmpeg")

# ffmpeg の場所はOSで切り替える:
#   Windows  -> 同梱の ffmpeg フォルダ(ローカル実行・将来のWindows公開向け)
#   Linux等  -> システムの ffmpeg をyt-dlpに自動検出させる(None)
# FFMPEG_PATH を指定すればそちらを優先する
if os.name == "nt" and os.path.isdir(FFMPEG_DIR):
    FFMPEG_LOCATION = FFMPEG_DIR
else:
    FFMPEG_LOCATION = os.environ.get("FFMPEG_PATH") or None

# Windowsでパイプ出力がcp932になるとNode.js側(UTF-8)で文字化けするため、常にUTF-8で出力する
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

MEDIA_EXTENSIONS = (".mp4", ".mkv", ".webm", ".m4a", ".mp3")


def emit(message):
    # サーバーが1行ずつ読みやすいよう、必ずフラッシュして出力する
    print(message, flush=True)


def emit_status(status, **payload):
    # 最終状態はJSON行で通知する ( {"status": "done"/"error", ...} )
    print(json.dumps({"status": status, **payload}, ensure_ascii=False), flush=True)


def emit_env_info():
    # 不具合切り分け用: yt-dlp が使うJSランタイムと、解読スクリプト(ejs)の有無を表示する
    node_path = shutil.which("node")
    if node_path:
        try:
            node_version = subprocess.run(
                [node_path, "--version"], capture_output=True, text=True, timeout=5
            ).stdout.strip()
        except Exception:
            node_version = "unknown"
        emit(f"[env] node: {node_version or 'unknown'} ({node_path})")
    else:
        emit("[env] node: NOT FOUND")

    try:
        emit(f"[env] yt-dlp-ejs: {package_version('yt-dlp-ejs')}")
    except PackageNotFoundError:
        emit("[env] yt-dlp-ejs: NOT FOUND")


def human_bytes(size):
    if size is None:
        return "unknown"
    for unit in ("", "Ki", "Mi", "Gi"):
        if size < 1024:
            return f"{size:.2f}{unit}B"
        size /= 1024
    return f"{size:.2f}TiB"


def format_progress(hook):
    # 例: [download]  45.2% of ~ 123.45MiB at  8.50MiB/s ETA 00:12
    total = hook.get("total_bytes") or hook.get("total_bytes_estimate")
    downloaded = hook.get("downloaded_bytes", 0)
    speed = hook.get("speed")
    eta = hook.get("eta")
    name = os.path.basename(hook.get("filename", ""))

    parts = [f"[download] {downloaded / total * 100:6.1f}% of ~ {human_bytes(total)}"]
    if speed:
        parts.append(f"at {human_bytes(speed)}/s")
    if eta is not None:
        parts.append(f"ETA {eta // 60:02d}:{eta % 60:02d}")
    if name:
        parts.append(f"({name})")
    return " ".join(parts)


def progress_hook(hook):
    if hook["status"] == "downloading":
        emit(format_progress(hook))
    elif hook["status"] == "finished":
        emit("[download] 100%  変換・保存中...")


def main():
    if len(sys.argv) < 3:
        emit_status("error", message="URLと保存先フォルダを指定してください。")
        sys.exit(1)

    url = sys.argv[1]
    out_dir = sys.argv[2]

    # どのバージョンで動いているか分かるようにしておく(不具合切り分け用)
    version = getattr(getattr(yt_dlp, "version", None), "__version__", "unknown")
    emit(f"[yt-dlp] version {version}")
    emit_env_info()

    # YTDLP_DEBUG=1 を設定すると yt-dlp の詳細ログをブラウザに表示する(切り分け用)
    verbose = os.environ.get("YTDLP_DEBUG") == "1"

    if not re.search(r"(youtube\.com|youtu\.be)", url):
        emit_status("error", message="YouTubeのURLのみダウンロードできます。")
        sys.exit(1)

    os.makedirs(out_dir, exist_ok=True)

    ydl_opts = {
        # タイトルで保存するが、同名ファイルの衝突は yt-dlp が自動で採番する
        "outtmpl": os.path.join(out_dir, "%(title)s.%(ext)s"),
        "nocheckcertificate": True,
        "quiet": not verbose,
        "no_warnings": not verbose,
        "verbose": verbose,
        "progress_hooks": [progress_hook],
        # YouTubeのJSチャレンジをNode.jsで解く(DenoはRenderに入っていないため)
        # yt-dlp[default] に含まれる yt-dlp-ejs が実際の解読スクリプト
        "js_runtimes": {"node": {}},
    }

    # ffmpegの場所が決まっている場合のみ明示する(Linux等はPATHから自動検出)
    if FFMPEG_LOCATION:
        ydl_opts["ffmpeg_location"] = FFMPEG_LOCATION

    # YouTubeのボット判定対策: cookiesファイルを環境変数で渡せるようにする
    cookie_file = os.environ.get("YTDLP_COOKIES")
    if cookie_file and os.path.isfile(cookie_file):
        ydl_opts["cookiefile"] = cookie_file

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except yt_dlp.utils.DownloadError as error:
        emit_status("error", message=str(error))
        sys.exit(1)
    except Exception as error:
        # 予期しない例外でもブラウザ側が待ち続けないようJSONで通知する
        emit_status("error", message=f"{type(error).__name__}: {error}")
        sys.exit(1)

    # 完了判定: 保存先で最も新しいメディアファイルを結果として通知する
    files = glob.glob(os.path.join(out_dir, "*"))
    media = [
        f for f in files
        if os.path.isfile(f) and f.lower().endswith(MEDIA_EXTENSIONS)
    ]
    if not media:
        emit_status("error", message="ダウンロードは完了しましたが、保存されたファイルが見つかりませんでした。")
        sys.exit(1)

    latest = max(media, key=os.path.getmtime)
    emit_status("done", filename=os.path.basename(latest))


if __name__ == "__main__":
    main()
