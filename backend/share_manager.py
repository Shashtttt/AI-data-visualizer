"""
Share Manager for AetherBI.
Creates and manages public share tokens for dashboards and charts.
Uses Firestore as primary store; falls back to a local JSON file.
"""

import os
import json
import secrets
import datetime

# Path to local fallback store
_SHARE_STORE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "shares.json"
)

# ---------------------------------------------
#  Local JSON fallback helpers
# ---------------------------------------------

def _load_local_store() -> dict:
    if os.path.exists(_SHARE_STORE_PATH):
        try:
            with open(_SHARE_STORE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_local_store(store: dict):
    try:
        with open(_SHARE_STORE_PATH, "w", encoding="utf-8") as f:
            json.dump(store, f, indent=2, default=str)
    except Exception as e:
        print(f"[ShareManager] Local store save error: {e}")


# ---------------------------------------------
#  Firestore helpers
# ---------------------------------------------

def _firebase_ready() -> bool:
    try:
        import firebase_config
        firebase_config.init_firebase()
        return True
    except Exception:
        return False


# ---------------------------------------------
#  Public API
# ---------------------------------------------

def create_share(uid: str, share_type: str, payload: dict, expiry_hours: int = 0) -> str:
    """
    Creates a share token for a chart or dashboard.

    Args:
        uid:          Owner user ID.
        share_type:   'chart' or 'dashboard'.
        payload:      Chart config / saved charts JSON.
        expiry_hours: 0 = never expires; else hours until expiry.

    Returns:
        token (str) - the unique share token.
    """
    token = secrets.token_urlsafe(20)
    now = datetime.datetime.utcnow().isoformat()
    expiry = None
    if expiry_hours and expiry_hours > 0:
        expiry = (datetime.datetime.utcnow() + datetime.timedelta(hours=expiry_hours)).isoformat()

    doc = {
        "token": token,
        "uid": uid,
        "type": share_type,
        "payload": payload,
        "created_at": now,
        "expiry": expiry,
        "views": 0,
    }

    # Try Firestore
    try:
        if _firebase_ready():
            import firebase_config
            db = firebase_config.get_firestore_client()
            db.collection("shares").document(token).set(doc)
            print(f"[ShareManager] Share saved to Firestore: {token}")
            return token
    except Exception as e:
        print(f"[ShareManager] Firestore save failed, using local: {e}")

    # Local fallback
    store = _load_local_store()
    store[token] = doc
    _save_local_store(store)
    return token


def get_share(token: str):
    """
    Retrieves a share by token. Returns None if not found or expired.
    Increments the view counter.
    """
    now = datetime.datetime.utcnow()

    # Try Firestore
    try:
        if _firebase_ready():
            import firebase_config
            db = firebase_config.get_firestore_client()
            doc_ref = db.collection("shares").document(token)
            doc = doc_ref.get()
            if not doc.exists:
                return None
            data = doc.to_dict()
            if data.get("expiry"):
                exp = datetime.datetime.fromisoformat(data["expiry"])
                if now > exp:
                    return None
            try:
                doc_ref.update({"views": data.get("views", 0) + 1})
            except Exception:
                pass
            return data
    except Exception as e:
        print(f"[ShareManager] Firestore get failed, using local: {e}")

    # Local fallback
    store = _load_local_store()
    data = store.get(token)
    if not data:
        return None
    if data.get("expiry"):
        try:
            exp = datetime.datetime.fromisoformat(data["expiry"])
            if now > exp:
                return None
        except Exception:
            pass
    data["views"] = data.get("views", 0) + 1
    store[token] = data
    _save_local_store(store)
    return data


def list_shares(uid: str) -> list:
    """Returns all active (non-expired) shares for a user, newest first."""
    now = datetime.datetime.utcnow()
    results = []

    # Try Firestore
    try:
        if _firebase_ready():
            import firebase_config
            db = firebase_config.get_firestore_client()
            docs = db.collection("shares").where("uid", "==", uid).stream()
            for doc in docs:
                d = doc.to_dict()
                if d.get("expiry"):
                    try:
                        if now > datetime.datetime.fromisoformat(d["expiry"]):
                            continue
                    except Exception:
                        pass
                results.append({
                    "token": d.get("token"),
                    "type": d.get("type"),
                    "created_at": d.get("created_at"),
                    "expiry": d.get("expiry"),
                    "views": d.get("views", 0),
                })
            results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return results
    except Exception as e:
        print(f"[ShareManager] Firestore list failed, using local: {e}")

    # Local fallback
    store = _load_local_store()
    for token, data in store.items():
        if data.get("uid") != uid:
            continue
        if data.get("expiry"):
            try:
                if now > datetime.datetime.fromisoformat(data["expiry"]):
                    continue
            except Exception:
                pass
        results.append({
            "token": token,
            "type": data.get("type"),
            "created_at": data.get("created_at"),
            "expiry": data.get("expiry"),
            "views": data.get("views", 0),
        })
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return results


def revoke_share(uid: str, token: str) -> bool:
    """Deletes a share token. Only the owner can revoke."""
    # Try Firestore
    try:
        if _firebase_ready():
            import firebase_config
            db = firebase_config.get_firestore_client()
            doc_ref = db.collection("shares").document(token)
            doc = doc_ref.get()
            if doc.exists and doc.to_dict().get("uid") == uid:
                doc_ref.delete()
                return True
            return False
    except Exception as e:
        print(f"[ShareManager] Firestore revoke failed, using local: {e}")

    # Local fallback
    store = _load_local_store()
    if token in store and store[token].get("uid") == uid:
        del store[token]
        _save_local_store(store)
        return True
    return False
