"""HandSpeak Web: MariaDB in production, isolated SQLite fallback for local tests."""
from __future__ import annotations

import csv
from shared_words import handle as shared_words_request
from shared_videos import handle as shared_video_request
from research_words import research_words, ResearchError
from experience import ExperienceStore, SQLITE_SCHEMA
import io
import json
import mimetypes
import math
import hashlib
import secrets
import hmac
import threading
import os
import re
from http.cookies import SimpleCookie, CookieError
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("HANDSPEAK_DATA_DIR", str(ROOT))) / "handspeak.db"
MAX_BODY = 1_000_000
AUTH_LOCK = threading.Lock()
AUTH_ATTEMPTS = {}
MYSQL_CONFIG = os.environ.get("HANDSPEAK_MYSQL_CONFIG")
DATABASE_ERRORS = (sqlite3.Error,)
if MYSQL_CONFIG:
    from mysql_storage import Connection as MySQLConnection
    import pymysql
    DATABASE_ERRORS += (pymysql.MySQLError,)

GESTURES = [
    ('J', 'J', 'Trace J with the pinky; experimental motion recognition'),
    ('Z', 'Z', 'Trace Z with the index; experimental motion recognition'),
    ('A', 'A', 'Closed fist, thumb beside the fingers'),
    ('B', 'B', 'Four fingers up together, thumb across palm'),
    ('C', 'C', 'Curve the fingers and thumb into a C'),
    ('D', 'D', 'Index up; thumb touches the other fingertips'),
    ('E', 'E', 'Curl fingertips down toward the thumb'),
    ('F', 'F', 'Index and thumb touch; other three fingers raised'),
    ('G', 'G', 'Index and thumb point sideways, held apart'),
    ('H', 'H', 'Index and middle fingers together, pointing sideways'),
    ('I', 'I', 'Pinky raised, other fingers closed'),
    ('K', 'K', 'Index and middle raised; thumb between them'),
    ('L', 'L', 'Index and thumb form an L'),
    ('M', 'M', 'Thumb tucked under three fingers'),
    ('N', 'N', 'Thumb tucked under two fingers'),
    ('O', 'O', 'Curve all fingertips to meet the thumb'),
    ('P', 'P', 'K handshape pointing down'),
    ('Q', 'Q', 'G handshape pointing down'),
    ('R', 'R', 'Cross the index and middle fingers'),
    ('S', 'S', 'Fist with thumb across the front'),
    ('T', 'T', 'Thumb tucked between index and middle fingers'),
    ('U', 'U', 'Index and middle fingers up together'),
    ('V', 'V', 'Index and middle fingers spread'),
    ('W', 'W', 'Index, middle, and ring fingers raised'),
    ('X', 'X', 'Index bent into a hook'),
    ('Y', 'Y', 'Thumb and pinky extended'),
    ('5', 'Five', 'All five fingers extended and spread'),
    # Digits are read in Numbers mode: 1, 3, 4, 5, 7 and 8 have handshapes of their own; 0, 2, 6 and 9
    # share one with O, V, W and F.
    ('0', 'Zero', 'Curve all fingertips to meet the thumb, like the letter O'),
    ('1', 'One', 'Index finger up, other fingers closed'),
    ('2', 'Two', 'Index and middle fingers up and spread, like the letter V'),
    ('3', 'Three', 'Thumb, index and middle fingers extended'),
    ('4', 'Four', 'Four fingers up and spread, thumb folded across the palm'),
    ('6', 'Six', 'Thumb touches the little finger, other fingers up, like the letter W'),
    ('7', 'Seven', 'Thumb touches the ring finger, other fingers up'),
    ('8', 'Eight', 'Thumb touches the middle finger, other fingers up'),
    ('9', 'Nine', 'Thumb touches the index finger, other fingers up, like the letter F'),
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    if MYSQL_CONFIG:
        db = MySQLConnection(MYSQL_CONFIG)
    else:
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize_database() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not MYSQL_CONFIG:
        with connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS auth_sessions (
                    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS password_resets (
                    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS gestures (
                    symbol TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    message TEXT NOT NULL,
                    character_count INTEGER NOT NULL,
                    duration_ms INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS detections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
                    latency_ms REAL NOT NULL CHECK(latency_ms >= 0),
                    correct INTEGER,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS evaluations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    respondent_type TEXT NOT NULL,
                    accuracy INTEGER NOT NULL CHECK(accuracy BETWEEN 1 AND 5),
                    usability INTEGER NOT NULL CHECK(usability BETWEEN 1 AND 5),
                    performance INTEGER NOT NULL CHECK(performance BETWEEN 1 AND 5),
                    comments TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );
            """)
            db.executescript(SQLITE_SCHEMA)
            # Existing unowned records are retained but never assigned to a visitor.
            if "owner_id" not in {r[1] for r in db.execute("PRAGMA table_info(sessions)")}:
                db.execute("ALTER TABLE sessions ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''")
            db.execute("CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(owner_id,created_at)")
            if "user_id" not in {r[1] for r in db.execute("PRAGMA table_info(sessions)")}:
                db.execute("ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL")
    with connect() as db:
        db.executemany(
            "INSERT OR IGNORE INTO gestures(symbol,name,description) VALUES(?,?,?)",
            GESTURES,
        )









class APIError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message


class HandSpeakHandler(SimpleHTTPRequestHandler):
    server_version = "HandSpeak/1.0"
    # Content types for scripts must not depend on the host: Windows takes them from the
    # registry, where .mjs (and on some machines .js) is text/plain, and browsers refuse
    # to run a module served with a non-JavaScript type.
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
                      ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")







    def check_origin(self):
        origin = self.headers.get('Origin')
        if origin and urlparse(origin).netloc != self.headers.get('Host'):
            raise APIError(403, "Request origin is not allowed")


    def send_head(self):
        from urllib.parse import unquote
        path = unquote(urlparse(self.path).path)
        parts = Path(path).parts
        allowed = {".html", ".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".json", ".md", ".mp4", ".vtt", ".woff", ".woff2"}
        target = Path(self.translate_path(self.path)).resolve()
        # Local copies of the browser runtime (MediaPipe) and its model files.
        if target.is_relative_to((ROOT / 'vendor').resolve()):
            allowed |= {'.mjs', '.wasm', '.task'}
        # Only the hand-model asset directory may serve ONNX weights.
        if target.suffix.lower() == '.onnx' and target.is_relative_to((ROOT / 'models' / 'hand-landmarks').resolve()):
            allowed.add('.onnx')
        if (any(part.startswith('.') for part in parts if part not in {'/'})
            or any(part in {'training', 'reports', '__pycache__', 'data'} for part in parts)
            or not target.is_relative_to(ROOT.resolve())
            or (path != '/' and (target.is_dir() or target.suffix.lower() not in allowed))):
            self.send_error(404, "Not found")
            return None
        return super().send_head()

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(self), microphone=()")
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        else:
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def do_GET(self) -> None:
        try:
            if shared_words_request(self, "GET"): return
            if shared_video_request(self, "GET"): return
            parsed = urlparse(self.path)
            if parsed.path == "/api/research-words/status":
                return self.json_response(research_words.status())
            if parsed.path == '/api/vocabulary-settings':
                return self.json_response(ExperienceStore(connect,ROOT,APIError,utc_now).settings())
            if parsed.path == "/api/health":
                return self.json_response({"status": "ok", "time": utc_now()})
            if parsed.path == "/api/gestures":
                with connect() as db:
                    rows = db.execute("SELECT symbol,name,description FROM gestures WHERE enabled=1 ORDER BY symbol").fetchall()
                return self.json_response({"gestures": [dict(r) for r in rows]})
            if parsed.path.startswith("/api/"):
                raise APIError(404, "API endpoint not found")
            return super().do_GET()
        except DATABASE_ERRORS:
            self.json_response({"error": "Database operation failed"}, 500)
        except (APIError, ValueError) as error:
            status = error.status if isinstance(error, APIError) else 400
            message = error.message if isinstance(error, APIError) else "Invalid request"
            self.json_response({"error": message}, status)

    def do_POST(self) -> None:
        try:
            if shared_words_request(self, "POST"): return
            if shared_video_request(self, "POST"): return
            parsed = urlparse(self.path)
            self.check_origin()
            data = self.read_json()
            if parsed.path == "/api/research-words":
                if data.get("consent") is not True: raise APIError(422, "Enable server landmark processing before recording.")
                try:
                    research_words.admit(self.headers.get('X-Real-IP', self.client_address[0]))
                    return self.json_response(research_words.predict(data.get("sequence")))
                except ResearchError as error:
                    return self.json_response({"error":str(error)},error.status)
            raise APIError(404, "API endpoint not found")
        except APIError as error:
            self.json_response({"error": error.message}, error.status)
        except DATABASE_ERRORS:
            self.json_response({"error": "Database operation failed"}, 500)

    def do_DELETE(self) -> None:
        try:
            if shared_words_request(self, "DELETE"): return
            if shared_video_request(self, "DELETE"): return
            self.check_origin()
            raise APIError(404, "API endpoint not found")
        except APIError as error:
            self.json_response({"error":error.message}, error.status)
        except DATABASE_ERRORS:
            self.json_response({"error":"Database operation failed"}, 500)



    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise APIError(400, "Invalid content length") from exc
        if length <= 0 or length > MAX_BODY:
            raise APIError(413 if length > MAX_BODY else 400, "Invalid request body")
        try:
            value = json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise APIError(400, "Request body must be valid JSON") from exc
        if not isinstance(value, dict):
            raise APIError(400, "JSON body must be an object")
        return value






    def json_response(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run(host: str = "127.0.0.1", port: int = 8000) -> None:
    initialize_database()
    server = ThreadingHTTPServer((host, port), HandSpeakHandler)
    print(f"HandSpeak Web is running at http://{host}:{port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
