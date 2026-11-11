import base64
import json


def restore_session(blob: str) -> dict:
    # JSON carries data only, so it cannot execute code.
    return json.loads(base64.b64decode(blob))
