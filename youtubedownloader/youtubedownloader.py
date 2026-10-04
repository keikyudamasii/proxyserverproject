import yt_dlp
import os

# youtubedownloader.py があるフォルダ
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 同じフォルダにある ffmpeg
FFMPEG_DIR = os.path.join(BASE_DIR, "ffmpeg")

ydl_opts = {
    "outtmpl": "%(title)s.%(ext)s",
    "nocheckcertificate": True,
    "ffmpeg_location": FFMPEG_DIR,
}

URL = "https://www.youtube.com/watch?v=5GUaMOpfmr8"

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.download([URL])
