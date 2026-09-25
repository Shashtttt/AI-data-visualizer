"""
User authentication module for AetherBI.
Uses Firebase Auth when serviceAccountKey.json is present.
Falls back to local SQLite when Firebase is unavailable.
"""

import sqlite3
import os
from werkzeug.security import generate_password_hash, check_password_hash

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'users.db')
SERVICE_ACCOUNT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'serviceAccountKey.json')

# ─────────────────────────────────────────────
#  Detect which backend to use
# ─────────────────────────────────────────────

def _firebase_available() -> bool:
    """Returns True if Firebase serviceAccountKey.json is present."""
    return os.path.exists(SERVICE_ACCOUNT_PATH)


# ─────────────────────────────────────────────
#  SQLite Fallback (Local)
# ─────────────────────────────────────────────

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes SQLite DB (local fallback) and Firebase if key is present."""
    # Always init SQLite as fallback
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()

    # Seed default demo user if empty
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        demo_hash = generate_password_hash("demo123")
        cursor.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            ("demo", "demo@aetherbi.com", demo_hash)
        )
        conn.commit()
        print("Default demo user created: demo / demo123")

    conn.close()

    # Try Firebase init if key exists
    if _firebase_available():
        try:
            import firebase_config
            firebase_config.init_firebase()
            print("[Auth] Firebase Auth is ACTIVE — new registrations go to Firebase.")
        except Exception as e:
            print(f"[Auth] Firebase init failed, using SQLite only: {e}")
    else:
        print("[Auth] serviceAccountKey.json not found — using local SQLite auth.")

    print("Database initialized successfully.")


# ─────────────────────────────────────────────
#  Register User
# ─────────────────────────────────────────────

def register_user(username, email, password):
    """
    Registers a user.
    → Firebase Auth if key is present.
    → SQLite fallback otherwise.
    """
    if not username or not email or not password:
        return {"success": False, "message": "Username, email, and password are required."}

    username = username.strip()
    email = email.strip().lower()

    if len(password) < 6:
        return {"success": False, "message": "Password must be at least 6 characters."}

    # ── Firebase path ──
    if _firebase_available():
        try:
            from firebase_storage_helper import create_firebase_user
            result = create_firebase_user(username, email, password)
            if result["success"]:
                # Also mirror to SQLite so local session lookup still works
                _sqlite_register_mirror(username, email, password)
            return result
        except Exception as e:
            print(f"[Auth] Firebase register error, falling back to SQLite: {e}")

    # ── SQLite fallback ──
    return _sqlite_register(username, email, password)


def _sqlite_register(username, email, password):
    password_hash = generate_password_hash(password)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            (username, email, password_hash)
        )
        conn.commit()
        return {"success": True, "message": "Registration successful."}
    except sqlite3.IntegrityError as e:
        error_msg = str(e)
        if "username" in error_msg:
            return {"success": False, "message": "Username already exists."}
        elif "email" in error_msg:
            return {"success": False, "message": "Email already registered."}
        else:
            return {"success": False, "message": "User already exists with these details."}
    finally:
        conn.close()


def _sqlite_register_mirror(username, email, password):
    """Mirror Firebase user into SQLite so local session works."""
    password_hash = generate_password_hash(password)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT OR IGNORE INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            (username, email, password_hash)
        )
        conn.commit()
    except Exception:
        pass
    finally:
        conn.close()


# ─────────────────────────────────────────────
#  Validate / Login User
# ─────────────────────────────────────────────

def validate_user(username_or_email, password):
    """
    Validates credentials.
    → Firebase Auth REST if FIREBASE_WEB_API_KEY env var is set + key exists.
    → SQLite fallback otherwise.
    Returns user dict {id, username, email} or None.
    """
    if not username_or_email or not password:
        return None

    username_or_email = username_or_email.strip()

    # ── Firebase path (needs Web API Key env var) ──
    if _firebase_available() and os.environ.get("FIREBASE_WEB_API_KEY"):
        try:
            from firebase_storage_helper import verify_firebase_user_password
            # Resolve username → email if needed
            email = _resolve_email(username_or_email)
            if email:
                user = verify_firebase_user_password(email, password)
                if user:
                    return user
        except Exception as e:
            print(f"[Auth] Firebase login error, falling back to SQLite: {e}")

    # ── SQLite fallback ──
    return _sqlite_validate(username_or_email, password)


def _sqlite_validate(username_or_email, password):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, username, email, password_hash FROM users WHERE username = ? OR email = ?",
        (username_or_email, username_or_email.lower())
    )
    user = cursor.fetchone()
    conn.close()

    if user and check_password_hash(user['password_hash'], password):
        return {
            "id": user['id'],
            "username": user['username'],
            "email": user['email']
        }
    return None


def _resolve_email(username_or_email: str) -> str | None:
    """If input is not an email, look up email by username in SQLite."""
    if "@" in username_or_email:
        return username_or_email
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT email FROM users WHERE username = ?", (username_or_email,))
    row = cursor.fetchone()
    conn.close()
    return row["email"] if row else None
