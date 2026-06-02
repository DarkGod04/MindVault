import sqlite3
import os
from datetime import datetime

DATABASE_URL = os.environ.get("DATABASE_URL", "")
IS_POSTGRES = DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://")

if IS_POSTGRES:
    import psycopg2
    import psycopg2.extras
else:
    psycopg2 = None

def get_db_connection():
    if IS_POSTGRES:
        # Neon and Render database URLs can use postgres://, which psycopg2 handles natively
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    else:
        DB_FILE = "data/mindvault.db"
        os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    if IS_POSTGRES:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(255),
                google_id VARCHAR(255) UNIQUE,
                password_hash VARCHAR(255),
                created_at VARCHAR(100) NOT NULL
            )
        """)
    else:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT,
                google_id TEXT UNIQUE,
                password_hash TEXT,
                created_at TEXT NOT NULL
            )
        """)
    conn.commit()
    cursor.close()
    conn.close()

def create_user(username: str, password_hash: str = None, email: str = None, google_id: str = None) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    created_at = datetime.utcnow().isoformat()
    try:
        if IS_POSTGRES:
            cursor.execute(
                "INSERT INTO users (username, password_hash, email, google_id, created_at) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (username, password_hash, email, google_id, created_at)
            )
            user_id = cursor.fetchone()[0]
        else:
            cursor.execute(
                "INSERT INTO users (username, password_hash, email, google_id, created_at) VALUES (?, ?, ?, ?, ?)",
                (username, password_hash, email, google_id, created_at)
            )
            user_id = cursor.lastrowid
        conn.commit()
        return user_id
    except Exception as e:
        conn.rollback()
        err_msg = str(e).lower()
        if "unique" in err_msg or "duplicate" in err_msg or "integrityerror" in err_msg:
            raise ValueError(f"User '{username}' or Google credentials already registered.") from e
        raise e
    finally:
        cursor.close()
        conn.close()

def get_user_by_username(username: str) -> dict | None:
    conn = get_db_connection()
    if IS_POSTGRES:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
    else:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if row:
        return dict(row)
    return None

def get_user_by_google_id(google_id: str) -> dict | None:
    conn = get_db_connection()
    if IS_POSTGRES:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cursor.execute("SELECT * FROM users WHERE google_id = %s", (google_id,))
    else:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE google_id = ?", (google_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if row:
        return dict(row)
    return None

def get_user_by_id(user_id: int) -> dict | None:
    conn = get_db_connection()
    if IS_POSTGRES:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
    else:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if row:
        return dict(row)
    return None
