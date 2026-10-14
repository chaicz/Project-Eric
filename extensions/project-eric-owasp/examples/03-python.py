"""
Project Eric OWASP — Python sample (intentionally vulnerable)

SAFE COUNTERPART: ./secure/python-secure.py
"""

import hashlib
import pickle
import subprocess
import urllib.request
import yaml
import os
import requests
from flask import Flask, request

app = Flask(__name__)

# ---------------------------------------------------------------------------
# A02-003 — hard-coded secret in source
# ---------------------------------------------------------------------------
# ❌ A02-003: production secret sitting in a VCS-tracked file.
DATABASE_PASSWORD = "hunter2-very-secret"
SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T000/B000/XXXXXXXXXX"


# ---------------------------------------------------------------------------
# A02-004 — insecure HTTP for an API
# ---------------------------------------------------------------------------
LEGACY_API = "http://internal.svc.cluster.local:9000/stats"

# ---------------------------------------------------------------------------
# A02-001 — MD5 used for password hashing
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    """❌ A02-001: MD5 has practical collisions and is fast — wrong tool for
    password storage. Use bcrypt / argon2 / scrypt instead."""
    return hashlib.md5(password.encode()).hexdigest()


# ---------------------------------------------------------------------------
# A02-002 — SHA-1 used for integrity
# ---------------------------------------------------------------------------
def fingerprint_file(path: str) -> str:
    """❌ A02-002: SHA-1 is collision-prone (SHAttered). Use SHA-256."""
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in f:
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# PY-A02-001 — assert used as a security check
# ---------------------------------------------------------------------------
def require_admin(user):
    # ❌ PY-A02-001: `python -O` strips assertions. Use an explicit raise.
    assert isinstance(user, dict) and user.get("role") == "admin"
    return True


# A07-001 — A07-001 sentinel comment that matches the global regex.
#   The rule looks for `if password.length < 5` form; this comment carries it.

# A07-002 — plaintext password storage
# ---------------------------------------------------------------------------
@app.route("/register", methods=["POST"])
def register():
    # ❌ A07-002: the literal cleartext password stays in source control.
    password = "fallback-cleartext-password-123456"
    default_password = password
    db.execute("INSERT INTO users (email, pwd) VALUES (?, ?)",
               (request.form["email"], password))


# ---------------------------------------------------------------------------
# PY-A03-001 — subprocess with shell=True
# ---------------------------------------------------------------------------
def convert_user_upload(filename: str):
    # ❌ PY-A03-001: shell=True lets `; rm -rf ~` and friends escape.
    subprocess.call(f"convert /tmp/{filename} /tmp/out.png", shell=True)


# ---------------------------------------------------------------------------
# A03-002 — os.system / popen with concat
# ---------------------------------------------------------------------------
def list_dir(dirname: str):
    # ❌ A03-002: classic command-injection sink in Python.
    os.system("ls -la " + dirname)


# ---------------------------------------------------------------------------
# A08-001 — pickle.loads / yaml.load on external data
# ---------------------------------------------------------------------------
def load_session(blob: bytes):
    # ❌ A08-001: pickle deserialisation executes arbitrary code.
    return pickle.loads(blob)


def load_config(text: str):
    # ❌ A08-001: yaml.load without SafeLoader can execute arbitrary code.
    return yaml.load(text)


# ---------------------------------------------------------------------------
# A10-001 — urllib.urlopen / requests to a user-supplied URL
# ---------------------------------------------------------------------------
@app.route("/proxy")
def proxy():
    target = request.args.get("url")
    # ❌ A10-001: attacker can hit internal services / cloud metadata.
    return urllib.request.urlopen(target).read().decode()
    # `requests.get(target)` is equivalent — keep both in mind.


# ---------------------------------------------------------------------------
# A05-002 — Flask debug mode
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # ❌ A05-002: DEBUG=True exposes the Werkzeug debugger (and sometimes the
    #              REPL) to anyone who can reach the port.
    app.run(host="0.0.0.0", debug=True)


# ---------------------------------------------------------------------------
# A04-001 — TODO at a security-sensitive seam
# ---------------------------------------------------------------------------
def rotate_db_password():
    # TODO: hook this up to AWS Secrets Manager before going live.
    return DATABASE_PASSWORD
