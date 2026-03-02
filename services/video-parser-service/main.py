import mimetypes
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
from yt_dlp import YoutubeDL


class DownloadRequest(BaseModel):
    lectureId: str
    url: HttpUrl


class DownloadResponse(BaseModel):
    lectureId: str
    sourceUrl: str
    storagePath: str
    filename: str
    mimeType: str
    title: str
    durationSec: int


app = FastAPI(title="video-parser-service", version="0.1.0")


def _safe_filename(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", name)


def _pick_downloaded_path(tmpdir: Path, info: dict[str, Any], ydl: YoutubeDL) -> Path:
    prepared = Path(ydl.prepare_filename(info))
    if prepared.exists():
        return prepared

    requested = info.get("requested_downloads")
    if isinstance(requested, list) and requested:
        candidate = requested[0].get("filepath")
        if isinstance(candidate, str) and Path(candidate).exists():
            return Path(candidate)

    entries = sorted([p for p in tmpdir.glob("*") if p.is_file()], key=lambda p: p.stat().st_size, reverse=True)
    if entries:
        return entries[0]

    raise HTTPException(status_code=502, detail="yt_dlp downloaded no media file")


def _download_video(url: str) -> tuple[Path, dict[str, Any]]:
    timeout_sec = int(os.getenv("VIDEO_PARSER_SOCKET_TIMEOUT_SEC", "45"))
    with tempfile.TemporaryDirectory(prefix="video-parser-") as tmp:
        tmpdir = Path(tmp)
        opts = {
            "format": os.getenv("VIDEO_PARSER_FORMAT", "bestaudio/best"),
            "outtmpl": str(tmpdir / "%(id)s.%(ext)s"),
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "socket_timeout": timeout_sec,
        }

        with YoutubeDL(opts) as ydl:
            try:
                info = ydl.extract_info(url, download=True)
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(status_code=502, detail=f"yt_dlp failed: {exc}") from exc

            if not isinstance(info, dict):
                raise HTTPException(status_code=502, detail="yt_dlp returned unexpected metadata")

            downloaded = _pick_downloaded_path(tmpdir, info, ydl)

            # Copy file out of temp dir before context cleanup.
            persistent_tmp = Path(tempfile.mkdtemp(prefix="video-parser-persist-"))
            persistent_path = persistent_tmp / downloaded.name
            shutil.copy2(downloaded, persistent_path)
            return persistent_path, info


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "video-parser-service"}


@app.get("/ready")
def ready() -> dict[str, str]:
    return {"status": "ready"}


@app.post("/api/v1/download", response_model=DownloadResponse)
def download_video(payload: DownloadRequest) -> DownloadResponse:
    lecture_id = str(payload.lectureId).strip()
    if not lecture_id:
        raise HTTPException(status_code=400, detail="lectureId is required")

    artifacts_dir = Path(os.getenv("ARTIFACTS_DIR", "/app/storage"))
    source_url = str(payload.url)

    downloaded_path, info = _download_video(source_url)
    try:
        title = str(info.get("title") or "video")
        original_url = str(info.get("webpage_url") or source_url)

        source_name = downloaded_path.name
        safe_name = _safe_filename(source_name)
        rel_path = Path("raw") / f"{lecture_id}_{safe_name}"
        abs_path = artifacts_dir / rel_path
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(downloaded_path), abs_path)

        mime = mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
        duration_sec = int(info.get("duration") or 0)

        return DownloadResponse(
            lectureId=lecture_id,
            sourceUrl=original_url,
            storagePath=str(rel_path),
            filename=safe_name,
            mimeType=mime,
            title=title,
            durationSec=duration_sec,
        )
    finally:
        parent = downloaded_path.parent
        if parent.exists():
            shutil.rmtree(parent, ignore_errors=True)
