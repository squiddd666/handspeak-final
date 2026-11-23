# HandSpeak deployment bundle

Deploy this folder, not the original LIVE WEB directory. No existing database,
account records, secrets, training checkpoints, backups or removed admin/model
services are included. Tools and Messages remain disabled in the public UI.

## Local check (Python 3.11 or newer)

    python start.py

Open http://localhost:8000. If occupied, set PORT=8001 in the environment.
A new database is created under data/ outside the HTTP-served app/ directory.
The default SQLite backend needs only Python's standard library.
HOST and PORT can be set by your hosting provider. Use HOST=0.0.0.0 when needed.
The server is a capstone prototype based on Python http.server, not a hardened
production application server. Review security and capacity before a public launch.

## Docker + HTTPS on a server

1. Point a real domain's DNS records to your server.
2. Install Docker Engine and Compose. Allow incoming ports 80 and 443.
3. Copy .env.example to .env and replace DOMAIN with your domain (no https://).
4. Run: docker compose up -d --build
5. Open https://YOUR_DOMAIN and allow camera access when you choose Start camera.
6. Check /api/health and test actual signing, mobile camera permissions and audio.

Camera access requires HTTPS online (localhost is the development exception).
Deploy at the domain root: runtime/API URLs use absolute paths.
This is a Python-backed app; GitHub Pages or static-only hosting cannot run its APIs.
For another container/Python host, run python start.py and attach persistent
storage at HANDSPEAK_DATA_DIR. Terminate HTTPS at a trusted reverse proxy.
Do not expose the backend directly when trusting forwarded headers.

Database data persists in the handspeak_data Docker volume. Back up this volume;
never publish it or commit it. docker compose down preserves it; down -v deletes it.
Your old database was deliberately not copied. Existing users/history start empty.

## Dependencies and internet use

MediaPipe runtime and face/hand models are bundled. Google Fonts and the optional
ONNX detector's onnxruntime-web CDN require internet. Some lessons link externally.
Model notices and source attributions are included. Review dataset/model/media
redistribution rights before public hosting; this package does not grant a license.

Optional MariaDB support remains in mysql_storage.py, but is not configured in this
SQLite bundle. It requires PyMySQL and a private HANDSPEAK_MYSQL_CONFIG file outside
app/. Never upload database credentials inside the served directory.

## Included documentation

FILE-MANIFEST.json lists every bundled runtime file with SHA-256 and size.
No original database or test-generated database is part of the release.

References: https://caddyserver.com/docs/quick-starts/reverse-proxy and https://docs.python.org/3.11/library/http.server.html
