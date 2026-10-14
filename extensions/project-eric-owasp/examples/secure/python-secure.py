"""
Project Eric OWASP — Python SECURE counterpart.
"""

import hashlib
import hmac
import json
import os
import subprocess
import secrets

import bcrypt
import requests
from flask import Flask, abort
from itsdangerous import URLSafeTimedSerializer

app = Flask(__name__)
signer = URLSafeTimedSerializer(os.environ["SESSION_SECRET"])


# bcrypt + ≥ 12 char minimum
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def register(db, email: str, password: str) -> None:
    if len(password) < 12:
        abort(400, "weak password")
    db.execute(
        "INSERT INTO users (email, password_hash) VALUES (?, ?)",
        (email, hash_password(password)),
    )


# secrets from the environment
DATABASE_PASSWORD = os.environ["DATABASE_PASSWORD"]
SLACK_WEBHOOK_URL = os.environ["SLACK_WEBHOOK_URL"]

# HTTPS
LEGACY_API = os.environ["LEGACY_API"]

# SHA-256 HMAC for integrity
def sign_payload(secret: bytes, payload: bytes) -> str:
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()

# SHA-256 for fingerprinting
def fingerprint_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

# explicit check, never assert
def require_admin(user):
    if not isinstance(user, dict) or user.get("role") != "admin":
        raise PermissionError("admin only")

# ≥ 12 characters
def is_valid_password(pwd: str) -> bool:
    return isinstance(pwd, str) and len(pwd) >= 12

# args as a list, shell=False
def convert_user_upload(filename: str):
    if not filename.isalnum():
        raise ValueError("invalid filename")
    subprocess.run(["convert", f"/tmp/{filename}", "/tmp/out.png"], check=True)

# no concat into shells
def list_dir(dirname: str):
    if not dirname.startswith("/var/log/"):
        raise ValueError("bad path")
    subprocess.run(["ls", "-la", dirname], check=True)

# json instead of pickle / yaml.load
def load_session(blob: bytes):
    return json.loads(blob)

def load_config(text: str):
    import yaml
    return yaml.safe_load(text)

# URL allowlist for SSRF
ALLOWED_HOSTS = {"images.example.com"}


@app.route("/proxy")
def proxy():
    target = request.args.get("url", "")  # noqa: F821
    u = requests.utils.urlparse(target)
    if u.hostname not in ALLOWED_HOSTS:
        abort(400, "blocked")
    return requests.get(target, timeout=5).text

# debug off
if __name__ == "__main__":
    app.run(host="127.0.0.1", debug=False)

# pulled from a secret store
def rotate_db_password():
    return secrets_manager.read("database/password")  # noqa: F821
