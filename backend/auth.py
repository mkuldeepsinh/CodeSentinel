import os
import time
import json
import base64
import hmac
import hashlib
from typing import Optional, Dict, Any

JWT_SECRET = os.environ.get("JWT_SECRET", "codesentinel_secret_key_terracotta_basalt")
JWT_ALGORITHM = "HS256"

def hash_password(password: str) -> str:
    """
    Hash a password using PBKDF2 with SHA-256.
    Returns: salt_hex$hash_hex
    """
    salt = os.urandom(16)
    db_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt,
        100000  # iterations
    )
    return f"{salt.hex()}${db_hash.hex()}"

def verify_password(password: str, hashed_password: str) -> bool:
    """
    Verify a password against a hash created by hash_password.
    """
    try:
        salt_hex, hash_hex = hashed_password.split('$')
        salt = bytes.fromhex(salt_hex)
        db_hash = bytes.fromhex(hash_hex)
        input_hash = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt,
            100000
        )
        return hmac.compare_digest(input_hash, db_hash)
    except Exception:
        return False

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def base64url_decode(data: str) -> bytes:
    padding = '=' * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode((data + padding).encode('utf-8'))

def create_access_token(data: dict, expires_delta_seconds: int = 3600 * 24) -> str:
    """
    Generates a JWT token using pure python cryptography.
    """
    header = {"alg": JWT_ALGORITHM, "typ": "JWT"}
    payload = data.copy()
    payload["exp"] = int(time.time()) + expires_delta_seconds
    
    header_json = json.dumps(header, separators=(',', ':')).encode('utf-8')
    payload_json = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    
    encoded_header = base64url_encode(header_json)
    encoded_payload = base64url_encode(payload_json)
    
    signing_input = f"{encoded_header}.{encoded_payload}".encode('utf-8')
    signature = hmac.new(JWT_SECRET.encode('utf-8'), signing_input, hashlib.sha256).digest()
    encoded_signature = base64url_encode(signature)
    
    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"

def decode_access_token(token: str) -> Optional[dict]:
    """
    Decodes and verifies a JWT token.
    """
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
            
        encoded_header, encoded_payload, encoded_signature = parts
        
        signing_input = f"{encoded_header}.{encoded_payload}".encode('utf-8')
        expected_signature = hmac.new(JWT_SECRET.encode('utf-8'), signing_input, hashlib.sha256).digest()
        
        provided_signature = base64url_decode(encoded_signature)
        
        if not hmac.compare_digest(provided_signature, expected_signature):
            return None
            
        payload_bytes = base64url_decode(encoded_payload)
        payload = json.loads(payload_bytes.decode('utf-8'))
        
        if payload.get("exp", 0) < time.time():
            return None  # Expired token
            
        return payload
    except Exception:
        return None
