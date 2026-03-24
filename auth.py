import os
import json
import logging
from typing import Optional
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, auth

load_dotenv()
logger = logging.getLogger(__name__)

# try file path first, then env var with JSON string
cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
dev_auth_bypass = os.getenv("DEV_AUTH_BYPASS", "").lower() in {
    "1", "true", "yes", "on"
}
dev_auth_user_id = os.getenv("DEV_AUTH_USER_ID", "local-dev-user")
_dev_auth_logged = False

if cred_path and os.path.exists(cred_path):
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
    logger.info("Firebase Admin SDK initialized from file")
elif cred_json:
    cred = credentials.Certificate(json.loads(cred_json))
    firebase_admin.initialize_app(cred)
    logger.info("Firebase Admin SDK initialized from env var")
else:
    logger.warning(
        "No Firebase credentials found — "
        "auth disabled, all requests treated as anonymous"
    )


def get_user_id(authorization_header: Optional[str]) -> Optional[str]:
    """Verify a Firebase ID token from a Bearer header, return uid."""
    global _dev_auth_logged
    if dev_auth_bypass:
        if not _dev_auth_logged:
            logger.info(
                "DEV_AUTH_BYPASS enabled; using local user '%s'",
                dev_auth_user_id
            )
            _dev_auth_logged = True
        return dev_auth_user_id
    if not authorization_header:
        return None
    if not authorization_header.startswith("Bearer "):
        return None
    token = authorization_header[7:]
    try:
        decoded = auth.verify_id_token(token)
        return decoded["uid"]
    except Exception as e:
        logger.debug("Token verification failed: %s", e)
        return None
