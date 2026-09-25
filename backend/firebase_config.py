"""
Firebase Admin SDK Initialization for AetherBI Backend.
Provides Firestore client, Storage bucket, and Auth references.
"""
import os
import json
import firebase_admin
from firebase_admin import credentials, firestore, storage, auth

# Path to the service account key
WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVICE_ACCOUNT_PATH = os.path.join(WORKSPACE_DIR, 'serviceAccountKey.json')

# Firebase project configuration
FIREBASE_PROJECT_ID = "dataset-visualizer"
FIREBASE_STORAGE_BUCKET = "dataset-visualizer.firebasestorage.app"

_initialized = False

def init_firebase():
    """Initialize Firebase Admin SDK. Safe to call multiple times."""
    global _initialized
    if _initialized:
        return
    
    if os.path.exists(SERVICE_ACCOUNT_PATH):
        cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
        firebase_admin.initialize_app(cred, {
            'storageBucket': FIREBASE_STORAGE_BUCKET
        })
        print(f"[Firebase] Initialized with service account key.")
    else:
        # Try Application Default Credentials (ADC) for cloud environments
        try:
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred, {
                'storageBucket': FIREBASE_STORAGE_BUCKET
            })
            print("[Firebase] Initialized with Application Default Credentials.")
        except Exception as e:
            raise RuntimeError(
                f"Firebase Admin SDK initialization failed.\n"
                f"Please place your serviceAccountKey.json at:\n"
                f"  {SERVICE_ACCOUNT_PATH}\n"
                f"Download it from: Firebase Console → Project Settings → Service Accounts → Generate New Private Key\n"
                f"Error: {e}"
            )
    
    _initialized = True
    print("[Firebase] Admin SDK ready.")


def get_firestore_client():
    """Returns the Firestore client."""
    init_firebase()
    return firestore.client()


def get_storage_bucket():
    """Returns the default Firebase Storage bucket."""
    init_firebase()
    return storage.bucket()


def get_auth():
    """Returns the Firebase Auth module."""
    init_firebase()
    return auth
