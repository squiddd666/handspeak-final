"""HandSpeak Web: MariaDB in production, isolated SQLite fallback for local tests."""
from __future__ import annotations

import csv
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



def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=5, maxmem=64*1024*1024).hex()
    return f"scrypt${salt}${digest}"


def password_matches(password: str, saved: str) -> bool:
    try:
        return hmac.compare_digest(password_hash(password, saved.split('$')[1]), saved)
    except (ValueError, IndexError):
        return False


def validate_password(password):
    if not isinstance(password, str) or not 12 <= len(password) <= 128:
        raise APIError(422, "Use a password of 12 to 128 characters")
    return password


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

    def cookie(self, name):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except CookieError:
            pass
        return cookie[name].value if name in cookie else ''

    def visitor(self):
        if not hasattr(self, '_visitor'):
            value = self.cookie('handspeak_visitor')
            self._visitor = value if re.fullmatch(r'[a-f0-9]{32}', value) else uuid.uuid4().hex
            self._set_visitor = self._visitor != value
        return self._visitor

    def current_user(self):
        if not hasattr(self, '_user'):
            token = self.cookie('handspeak_auth')
            with connect() as db:
                row = db.execute("SELECT u.id,u.email,u.role,u.created_at FROM users u JOIN auth_sessions a ON a.user_id=u.id WHERE a.token_hash=? AND a.expires_at>? AND u.active=1", (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone() if token else None
            self._user = dict(row) if row else None
        return self._user

    def require_user(self):
        user = self.current_user()
        if not user: raise APIError(401, "Sign in to continue")
        return user

    def owner(self) -> str:
        user = self.current_user()
        return 'user:'+user['id'] if user else 'guest:'+self.visitor()

    def set_auth(self, user_id):
        token = secrets.token_urlsafe(32)
        with connect() as db:
            db.execute("DELETE FROM auth_sessions WHERE expires_at<?", (time.time(),))
            db.execute("INSERT INTO auth_sessions VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), user_id, time.time()+7*86400))
            # Move only this visitor's anonymous history, never another account's history.
            db.execute("UPDATE sessions SET owner_id=?,user_id=? WHERE owner_id=?", ('user:'+user_id, user_id, 'guest:'+self.visitor()))
        self._auth_cookie = token

    def check_origin(self):
        origin = self.headers.get('Origin')
        if origin and urlparse(origin).netloc != self.headers.get('Host'):
            raise APIError(403, "Request origin is not allowed")

    def throttle_auth(self):
        # nginx supplies X-Real-IP; direct local tests use the socket address.
        address = self.headers.get('X-Real-IP', self.client_address[0])
        now = time.time()
        with AUTH_LOCK:
            for key in list(AUTH_ATTEMPTS):
                if now - AUTH_ATTEMPTS[key][0] > 600: del AUTH_ATTEMPTS[key]
            entry = AUTH_ATTEMPTS.setdefault(address, [now, 0])
            if entry[1] >= 20: raise APIError(429, "Too many attempts. Try again in 10 minutes.")
            entry[1] += 1

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
        if getattr(self, "_set_visitor", False):
            secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
            self.send_header("Set-Cookie", f"handspeak_visitor={self._visitor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000{secure}")
        if hasattr(self, '_auth_cookie'):
            secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
            age = 7*86400 if self._auth_cookie else 0
            self.send_header("Set-Cookie", f"handspeak_auth={self._auth_cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age={age}{secure}")
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
            parsed = urlparse(self.path)
            if parsed.path.startswith("/api/"): self.owner()
            if parsed.path == "/api/research-words/status":
                return self.json_response(research_words.status())
            if parsed.path == "/api/auth/me":
                return self.json_response({"user": self.current_user()})
            if parsed.path == '/api/vocabulary-settings':
                return self.json_response(ExperienceStore(connect,ROOT,APIError,utc_now).settings())
            if parsed.path == "/api/health":
                return self.json_response({"status": "ok", "time": utc_now()})
            if parsed.path == "/api/gestures":
                with connect() as db:
                    rows = db.execute("SELECT symbol,name,description FROM gestures WHERE enabled=1 ORDER BY symbol").fetchall()
                return self.json_response({"gestures": [dict(r) for r in rows]})
            if parsed.path == "/api/sessions":
                limit = min(max(int(parse_qs(parsed.query).get("limit", [20])[0]), 1), 100)
                with connect() as db:
                    rows = db.execute("SELECT id,message,character_count,duration_ms,created_at FROM sessions WHERE owner_id=? ORDER BY created_at DESC LIMIT ?", (self.owner(), limit)).fetchall()
                return self.json_response({"sessions": [dict(r) for r in rows]})
            if parsed.path == "/api/metrics":
                return self.json_response(self.metrics())
            if parsed.path == "/api/export/sessions.csv":
                return self.export_sessions()
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
            parsed = urlparse(self.path)
            if parsed.path.startswith("/api/"): self.owner()
            self.check_origin()
            data = self.read_json()
            if parsed.path.startswith("/api/auth/"): return self.auth_action(parsed.path, data)
            if parsed.path == "/api/research-words":
                if data.get("consent") is not True: raise APIError(422, "Enable server landmark processing before recording.")
                try:
                    research_words.admit(self.headers.get('X-Real-IP', self.client_address[0]))
                    return self.json_response(research_words.predict(data.get("sequence")))
                except ResearchError as error:
                    return self.json_response({"error":str(error)},error.status)
            if parsed.path == "/api/sessions":
                return self.create_session(data)
            if parsed.path == "/api/evaluations":
                return self.create_evaluation(data)
            raise APIError(404, "API endpoint not found")
        except APIError as error:
            self.json_response({"error": error.message}, error.status)
        except DATABASE_ERRORS:
            self.json_response({"error": "Database operation failed"}, 500)

    def do_DELETE(self) -> None:
        try:
            self.check_origin()
            match = re.fullmatch(r"/api/sessions/([a-f0-9]{32})", urlparse(self.path).path)
            if not match: raise APIError(404, "Session not found")
            with connect() as db:
                count = db.execute("DELETE FROM sessions WHERE id=? AND owner_id=?", (match[1], self.owner())).rowcount
            if not count: raise APIError(404, "Session not found")
            self.json_response({"deleted": True})
        except APIError as error:
            self.json_response({"error":error.message}, error.status)
        except DATABASE_ERRORS:
            self.json_response({"error":"Database operation failed"}, 500)

    def auth_action(self, path, data):
        if path == '/api/auth/logout':
            with connect() as db:
                db.execute("DELETE FROM auth_sessions WHERE token_hash=?", (hashlib.sha256(self.cookie('handspeak_auth').encode()).hexdigest(),))
            self._auth_cookie = ''
            return self.json_response({'ok':True})
        self.throttle_auth()
        if path in {'/api/auth/register','/api/auth/login'}:
            email = data.get('email', '')
            if not isinstance(email, str) or len(email)>254:
                raise APIError(422, 'Enter a valid username or email address')
            valid_email = re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email.strip())
            valid_username = path == '/api/auth/login' and re.fullmatch(r'[A-Za-z0-9_.-]{3,64}', email.strip())
            if not (valid_email or valid_username):
                raise APIError(422, 'Enter a valid username or email address' if path == '/api/auth/login' else 'Enter a valid email address')
            email = email.strip().lower()
            password = data.get('password')
            if not isinstance(password, str) or len(password)>128: raise APIError(422, 'Enter a valid password')
            if path == '/api/auth/login':
                with connect() as db: row = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
                # Comparable password work for unknown users limits account probing.
                valid = password_matches(password, row['password_hash']) if row else bool(password_hash(password)) and False
                if not row or not valid or not row['active']: raise APIError(401, 'Username/email or password is incorrect')
                self.set_auth(row['id'])
                return self.json_response({'ok':True})
            validate_password(password)
            hashed = password_hash(password)
            with connect() as db:
                db.execute('BEGIN IMMEDIATE')
                if db.execute('SELECT 1 FROM users WHERE email=?',(email,)).fetchone(): raise APIError(409, 'An account already uses this email. Sign in instead.')
                uid=uuid.uuid4().hex
                db.execute('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)',(uid,email,hashed,'user',utc_now()))
            self.set_auth(uid)
            return self.json_response({'ok':True},201)
        if path == '/api/auth/password':
            user=self.require_user(); password=validate_password(data.get('password'));old=data.get('currentPassword','')
            if not isinstance(old,str) or len(old)>128: raise APIError(422,'Enter your current password')
            with connect() as db:
                row=db.execute('SELECT password_hash FROM users WHERE id=?',(user['id'],)).fetchone()
                if not password_matches(old,row['password_hash']): raise APIError(403,'Current password is incorrect')
                db.execute('UPDATE users SET password_hash=? WHERE id=?',(password_hash(password),user['id']))
                db.execute('DELETE FROM auth_sessions WHERE user_id=?',(user['id'],))
                db.execute('DELETE FROM password_resets WHERE user_id=?',(user['id'],))
            self.set_auth(user['id']); return self.json_response({'ok':True})
        if path == '/api/auth/reset':
            token=data.get('token','');password=validate_password(data.get('password'))
            if not isinstance(token,str): raise APIError(422,'Invalid reset link')
            hashed=password_hash(password)
            with connect() as db:
                db.execute('BEGIN IMMEDIATE')
                row=db.execute('SELECT p.user_id FROM password_resets p JOIN users u ON u.id=p.user_id WHERE p.token_hash=? AND p.expires_at>? AND u.active=1',(hashlib.sha256(token.encode()).hexdigest(),time.time())).fetchone()
                if not row: raise APIError(403,'Reset link is invalid or expired')
                db.execute('UPDATE users SET password_hash=? WHERE id=?',(hashed,row['user_id']))
                db.execute('DELETE FROM password_resets WHERE user_id=?',(row['user_id'],))
                db.execute('DELETE FROM auth_sessions WHERE user_id=?',(row['user_id'],))
            self._auth_cookie='';return self.json_response({'ok':True})
        raise APIError(404,'Account endpoint not found')


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

    def create_session(self, data: dict) -> None:
        if not isinstance(data.get("message"), str):
            raise APIError(422, "Message must be text")
        message = data["message"].strip()
        if not message or len(message) > 1000:
            raise APIError(422, "Message must contain 1 to 1000 characters")
        detections = data.get("detections", [])
        if not isinstance(detections, list) or len(detections) > 1000:
            raise APIError(422, "Detections must be a list with at most 1000 items")
        session_id = uuid.uuid4().hex
        created = utc_now()
        duration = data.get("durationMs", 0)
        if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not 0 <= duration <= 86_400_000 or not math.isfinite(duration):
            raise APIError(422, "Duration must be between 0 and 86400000 milliseconds")
        duration = int(duration)
        clean = []
        allowed = {item[0] for item in GESTURES}
        for item in detections:
            try:
                symbol = str(item["symbol"])
                confidence = float(item["confidence"])
                latency = float(item.get("latencyMs", 0))
            except (KeyError, TypeError, ValueError, OverflowError) as exc:
                raise APIError(422, "Each detection requires a valid symbol and confidence") from exc
            if symbol not in allowed or not 0 <= confidence <= 1 or not 0 <= latency <= 60_000:
                raise APIError(422, "Detection contains values outside the accepted range")
            # Optional: whether the user kept this result (true) or corrected it (false).
            correct = item.get("correct") if isinstance(item, dict) else None
            if correct is not None and not isinstance(correct, bool):
                raise APIError(422, "Detection correct must be true, false or absent")
            clean.append((session_id, symbol, confidence, latency, created, None if correct is None else int(correct)))
        # Rows without a correct value keep the five-column insert, which every deployed
        # schema accepts; the correct column is written only when a client sends it.
        marked = any(row[5] is not None for row in clean)
        with connect() as db:
            db.execute("INSERT INTO sessions(id,message,character_count,duration_ms,created_at,owner_id,user_id) VALUES(?,?,?,?,?,?,?)", (session_id, message, len(message), duration, created, self.owner(), self.current_user()["id"] if self.current_user() else None))
            if marked:
                db.executemany("INSERT INTO detections(session_id,symbol,confidence,latency_ms,created_at,correct) VALUES(?,?,?,?,?,?)", clean)
            elif clean:
                db.executemany("INSERT INTO detections(session_id,symbol,confidence,latency_ms,created_at) VALUES(?,?,?,?,?)", [row[:5] for row in clean])
        self.json_response({"id": session_id, "createdAt": created}, HTTPStatus.CREATED)

    def create_evaluation(self, data: dict) -> None:
        respondent = str(data.get("respondentType", "")).strip()
        if respondent not in {"Student", "Educator", "Deaf/Hard-of-Hearing", "Hearing", "Other"}:
            raise APIError(422, "Select a valid respondent type")
        try:
            ratings = [int(data[key]) for key in ("accuracy", "usability", "performance")]
        except (KeyError, TypeError, ValueError, OverflowError) as exc:
            raise APIError(422, "All three ratings are required") from exc
        if any(value < 1 or value > 5 for value in ratings):
            raise APIError(422, "Ratings must be from 1 to 5")
        comments = str(data.get("comments", "")).strip()[:2000]
        with connect() as db:
            cursor = db.execute(
                "INSERT INTO evaluations(respondent_type,accuracy,usability,performance,comments,created_at) VALUES(?,?,?,?,?,?)",
                (respondent, *ratings, comments, utc_now()),
            )
        self.json_response({"id": cursor.lastrowid}, HTTPStatus.CREATED)

    def metrics(self) -> dict:
        with connect() as db:
            totals = db.execute("SELECT COUNT(*) sessions, COALESCE(SUM(character_count),0) characters FROM sessions WHERE owner_id=?", (self.owner(),)).fetchone()
            detection = db.execute("SELECT COUNT(*) total, COALESCE(AVG(confidence),0) confidence, COALESCE(AVG(latency_ms),0) latency FROM detections JOIN sessions ON sessions.id=detections.session_id WHERE sessions.owner_id=?", (self.owner(),)).fetchone()
            evaluation = db.execute("SELECT COUNT(*) total, COALESCE(AVG(accuracy),0) accuracy, COALESCE(AVG(usability),0) usability, COALESCE(AVG(performance),0) performance FROM evaluations").fetchone()
        return {
            "sessions": totals["sessions"], "characters": int(totals["characters"]),
            "detections": detection["total"], "averageConfidence": round(float(detection["confidence"]), 3),
            "averageLatencyMs": round(float(detection["latency"]), 1), "evaluations": evaluation["total"],
            "ratings": {key: round(float(evaluation[key]), 2) for key in ("accuracy", "usability", "performance")},
        }

    def export_sessions(self) -> None:
        with connect() as db:
            rows = db.execute("SELECT id,message,character_count,duration_ms,created_at FROM sessions WHERE owner_id=? ORDER BY created_at DESC", (self.owner(),)).fetchall()
        keys=["id","message","character_count","duration_ms","created_at"]
        self.csv_response(["session_id",*keys[1:]], [[row[k] for k in keys] for row in rows], "handspeak-sessions.csv")

    def csv_response(self, columns, rows, filename):
        output=io.StringIO();writer=csv.writer(output);writer.writerow(columns)
        for row in rows:
            values=[]
            for value in row:
                if isinstance(value,str) and (value.lstrip().startswith(("=","+","-","@")) or value.startswith(("\t","\r","\n"))): value="'"+value
                values.append(value)
            writer.writerow(values)
        body=output.getvalue().encode('utf-8-sig')
        self.send_response(200)
        self.send_header('Content-Type','text/csv; charset=utf-8')
        self.send_header('Content-Disposition',f'attachment; filename={filename}')
        self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)

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
