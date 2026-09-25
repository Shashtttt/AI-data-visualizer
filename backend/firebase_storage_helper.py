"""
Firebase Storage & Firestore helper functions for AetherBI.
Handles dataset upload, download, list, and delete operations.
"""

import os
import tempfile
import datetime

# Lazy import — only initializes when key file is present
_firebase_ready = False

def _ensure_firebase():
    """Initialize Firebase only when serviceAccountKey.json is present."""
    global _firebase_ready
    if _firebase_ready:
        return True
    try:
        import firebase_config
        firebase_config.init_firebase()
        _firebase_ready = True
        return True
    except Exception as e:
        print(f"[Firebase] Not initialized: {e}")
        return False


# ─────────────────────────────────────────────
#  FIREBASE STORAGE — File Operations
# ─────────────────────────────────────────────

def upload_dataset(uid: str, filename: str, local_filepath: str) -> bool:
    """
    Uploads a local CSV/Excel file to Firebase Storage.
    Path in bucket: datasets/{uid}/{filename}
    Returns True on success, False on failure.
    """
    if not _ensure_firebase():
        return False
    try:
        import firebase_config
        bucket = firebase_config.get_storage_bucket()
        blob_path = f"datasets/{uid}/{filename}"
        blob = bucket.blob(blob_path)
        blob.upload_from_filename(local_filepath)
        print(f"[Firebase Storage] Uploaded: {blob_path}")
        return True
    except Exception as e:
        print(f"[Firebase Storage] Upload error: {e}")
        return False


def download_dataset_to_temp(uid: str, filename: str) -> str | None:
    """
    Downloads a dataset from Firebase Storage to a local temp file.
    Returns the local temp file path (caller must delete after use).
    Returns None on failure.
    """
    if not _ensure_firebase():
        return None
    try:
        import firebase_config
        bucket = firebase_config.get_storage_bucket()
        blob_path = f"datasets/{uid}/{filename}"
        blob = bucket.blob(blob_path)

        ext = os.path.splitext(filename)[1]
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
        tmp.close()

        blob.download_to_filename(tmp.name)
        print(f"[Firebase Storage] Downloaded: {blob_path} → {tmp.name}")
        return tmp.name
    except Exception as e:
        print(f"[Firebase Storage] Download error: {e}")
        return None


def delete_dataset_from_storage(uid: str, filename: str) -> bool:
    """Deletes a file from Firebase Storage."""
    if not _ensure_firebase():
        return False
    try:
        import firebase_config
        bucket = firebase_config.get_storage_bucket()
        blob = bucket.blob(f"datasets/{uid}/{filename}")
        blob.delete()
        print(f"[Firebase Storage] Deleted: datasets/{uid}/{filename}")
        return True
    except Exception as e:
        print(f"[Firebase Storage] Delete error: {e}")
        return False


def get_signed_download_url(uid: str, filename: str, expiry_minutes: int = 60) -> str | None:
    """
    Generates a signed URL to allow direct file download from Firebase Storage.
    URL expires after expiry_minutes.
    """
    if not _ensure_firebase():
        return None
    try:
        import firebase_config
        bucket = firebase_config.get_storage_bucket()
        blob = bucket.blob(f"datasets/{uid}/{filename}")
        url = blob.generate_signed_url(
            expiration=datetime.timedelta(minutes=expiry_minutes),
            method="GET",
            version="v4"
        )
        return url
    except Exception as e:
        print(f"[Firebase Storage] Signed URL error: {e}")
        return None


# ─────────────────────────────────────────────
#  FIRESTORE — Dataset Metadata Operations
# ─────────────────────────────────────────────

def save_dataset_metadata(uid: str, filename: str, size_kb: float,
                          row_count: int = 0, columns: list = None) -> bool:
    """
    Saves dataset metadata to Firestore collection 'datasets'.
    Document ID: {uid}_{filename}
    Stores row_count and columns list for future diff comparison.
    """
    if not _ensure_firebase():
        return False
    try:
        import firebase_config
        db = firebase_config.get_firestore_client()
        doc_id = f"{uid}_{filename}"
        db.collection("datasets").document(doc_id).set({
            "user_uid": uid,
            "filename": filename,
            "size_kb": size_kb,
            "row_count": row_count,
            "columns": columns or [],
            "version": 1,
            "uploaded_at": datetime.datetime.utcnow().isoformat(),
            "modified_at": datetime.datetime.utcnow().isoformat()
        })
        print(f"[Firestore] Saved metadata: {doc_id}")
        return True
    except Exception as e:
        print(f"[Firestore] Metadata save error: {e}")
        return False


def get_dataset_metadata(uid: str, filename: str) -> dict:
    """
    Retrieves current dataset metadata from Firestore.
    Returns empty dict if not found or Firebase unavailable.
    """
    if not _ensure_firebase():
        return {}
    try:
        import firebase_config
        db = firebase_config.get_firestore_client()
        doc_id = f"{uid}_{filename}"
        doc = db.collection("datasets").document(doc_id).get()
        if doc.exists:
            return doc.to_dict()
        return {}
    except Exception as e:
        print(f"[Firestore] Metadata get error: {e}")
        return {}


def compute_dataset_diff(old_meta: dict, new_row_count: int, new_columns: list) -> dict:
    """
    Compares old stored metadata with new upload stats.
    Returns a diff summary dict.
    """
    old_rows = old_meta.get("row_count", 0)
    old_cols = set(old_meta.get("columns", []))
    new_cols = set(new_columns)

    added_rows = max(0, new_row_count - old_rows)
    removed_rows = max(0, old_rows - new_row_count)
    new_columns_list = sorted(new_cols - old_cols)
    removed_columns_list = sorted(old_cols - new_cols)
    old_version = old_meta.get("version", 1)

    is_update = bool(old_meta) and (
        added_rows > 0 or removed_rows > 0 or
        new_columns_list or removed_columns_list
    )

    return {
        "is_update": is_update,
        "prev_version": old_version,
        "new_version": old_version + 1 if is_update else old_version,
        "prev_row_count": old_rows,
        "new_row_count": new_row_count,
        "added_rows": added_rows,
        "removed_rows": removed_rows,
        "new_columns": new_columns_list,
        "removed_columns": removed_columns_list,
    }


def bump_version(uid: str, filename: str, size_kb: float,
                 row_count: int, columns: list) -> bool:
    """
    Increments the version counter and updates metadata after a re-upload.
    """
    if not _ensure_firebase():
        return False
    try:
        import firebase_config
        db = firebase_config.get_firestore_client()
        doc_id = f"{uid}_{filename}"
        doc = db.collection("datasets").document(doc_id).get()
        current_version = 1
        if doc.exists:
            current_version = doc.to_dict().get("version", 1)
        db.collection("datasets").document(doc_id).update({
            "size_kb": size_kb,
            "row_count": row_count,
            "columns": columns,
            "version": current_version + 1,
            "modified_at": datetime.datetime.utcnow().isoformat()
        })
        print(f"[Firestore] Bumped version to {current_version + 1}: {doc_id}")
        return True
    except Exception as e:
        print(f"[Firestore] Version bump error: {e}")
        return False


def update_dataset_metadata(uid: str, filename: str, size_kb: float) -> bool:
    """Updates the modified_at timestamp and size after a cleaning operation."""
    if not _ensure_firebase():
        return False
    try:
        import firebase_config
        db = firebase_config.get_firestore_client()
        doc_id = f"{uid}_{filename}"
        db.collection("datasets").document(doc_id).update({
            "size_kb": size_kb,
            "modified_at": datetime.datetime.utcnow().isoformat()
        })
        return True
    except Exception as e:
        print(f"[Firestore] Metadata update error: {e}")
        return False


def list_user_datasets(uid: str) -> list:
    """
    Returns list of dataset metadata dicts for a user from Firestore.
    Each dict: {name, size_kb, modified}
    """
    if not _ensure_firebase():
        return []
    try:
        import firebase_config
        db = firebase_config.get_firestore_client()
        docs = db.collection("datasets").where("user_uid", "==", uid).stream()
        results = []
        for doc in docs:
            d = doc.to_dict()
            results.append({
                "name": d.get("filename", ""),
                "size_kb": d.get("size_kb", 0),
                "modified": d.get("modified_at", "")
            })
        # Sort by modified descending
        results.sort(key=lambda x: x["modified"], reverse=True)
        return results
    except Exception as e:
        print(f"[Firestore] List datasets error: {e}")
        return []


def delete_dataset_metadata(uid: str, filename: str) -> bool:
    """Deletes dataset metadata document from Firestore."""
    if not _ensure_firebase():
        return False
    try:
        import firebase_config
        db = firebase_config.get_firestore_client()
        doc_id = f"{uid}_{filename}"
        db.collection("datasets").document(doc_id).delete()
        print(f"[Firestore] Deleted metadata: {doc_id}")
        return True
    except Exception as e:
        print(f"[Firestore] Metadata delete error: {e}")
        return False


# ─────────────────────────────────────────────
#  FIREBASE AUTH — User Operations
# ─────────────────────────────────────────────

def create_firebase_user(username: str, email: str, password: str) -> dict:
    """
    Creates a user in Firebase Authentication.
    Returns {"success": True, "uid": uid} or {"success": False, "message": ...}
    """
    if not _ensure_firebase():
        return {"success": False, "message": "Firebase not initialized. Place serviceAccountKey.json in project root."}
    try:
        import firebase_config
        auth = firebase_config.get_auth()
        user = auth.create_user(
            email=email,
            password=password,
            display_name=username
        )
        print(f"[Firebase Auth] Created user: {user.uid} ({email})")
        return {"success": True, "uid": user.uid, "username": username, "email": email}
    except Exception as e:
        err = str(e)
        if "EMAIL_EXISTS" in err or "email-already-exists" in err:
            return {"success": False, "message": "Email already registered."}
        if "WEAK_PASSWORD" in err:
            return {"success": False, "message": "Password must be at least 6 characters."}
        return {"success": False, "message": f"Registration failed: {err}"}


def verify_firebase_user_password(email: str, password: str) -> dict | None:
    """
    Verifies email+password using Firebase Auth REST API (sign-in endpoint).
    Returns user dict {uid, username, email} or None if invalid.
    """
    if not _ensure_firebase():
        return None
    try:
        import urllib.request
        import json as _json
        import firebase_config

        # Read API key from service account or environment
        api_key = os.environ.get("FIREBASE_WEB_API_KEY", "")
        if not api_key:
            # Fallback: get from service account file
            sa_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "serviceAccountKey.json"
            )
            if os.path.exists(sa_path):
                with open(sa_path) as f:
                    sa = _json.load(f)
                    # Web API key is NOT in the service account, must be env var
            print("[Firebase Auth] FIREBASE_WEB_API_KEY env var not set. Cannot verify password via REST.")
            return None

        url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}"
        payload = _json.dumps({
            "email": email,
            "password": password,
            "returnSecureToken": True
        }).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = _json.loads(resp.read().decode("utf-8"))

        uid = body.get("localId")
        # Get display name from Auth admin
        auth = firebase_config.get_auth()
        user_record = auth.get_user(uid)
        return {
            "id": uid,
            "username": user_record.display_name or email.split("@")[0],
            "email": email
        }
    except Exception as e:
        print(f"[Firebase Auth] Login verify error: {e}")
        return None
