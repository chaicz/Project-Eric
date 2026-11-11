import base64
import pickle


def restore_session(blob: str) -> dict:
    # A08: pickle deserialisation of untrusted bytes is remote code execution.
    return pickle.loads(base64.b64decode(blob))
