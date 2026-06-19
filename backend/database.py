import os
import sqlite3
import json
import math
import uuid
from typing import List, Dict, Any, Optional

# Attempt to import psycopg for Postgres/Supabase support
try:
    import psycopg
    from psycopg.rows import dict_row
    psycopg_available = True
except ImportError:
    psycopg_available = False

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DATABASE_URL")
USE_POSTGRES = psycopg_available and DATABASE_URL is not None
SQLITE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "codesentinel_memory.db")

def init_db():
    """
    Initialises tables in either PostgreSQL or SQLite.
    Creates 'projects' and 'generations' tables.
    """
    if USE_POSTGRES:
        print("database.py: Initialising PostgreSQL (Supabase) database...")
        try:
            with psycopg.connect(DATABASE_URL) as conn:
                with conn.cursor() as cur:
                    # Enable the pgvector extension if it exists
                    try:
                        cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                    except Exception as ve:
                        print(f"database.py WARNING: Failed to enable vector extension: {ve}")
                    
                    # Create projects table
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS projects (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            prompt TEXT NOT NULL,
                            language TEXT NOT NULL,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                    
                    # Create generations table
                    # Note: We use TEXT for findings and store serialized JSON for uniformity,
                    # but PostgreSQL supports JSONB which we fallback to.
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS generations (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
                            code TEXT NOT NULL,
                            security_score INTEGER NOT NULL,
                            findings TEXT NOT NULL,
                            embedding vector(3072),
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                conn.commit()
            print("database.py: PostgreSQL setup completed successfully.")
        except Exception as e:
            print(f"database.py ERROR: Failed to connect to PostgreSQL: {e}")
            print("database.py: Falling back to SQLite for custom tables.")
            _init_sqlite()
    else:
        _init_sqlite()

def _init_sqlite():
    print(f"database.py: Initialising SQLite database at {SQLITE_PATH}...")
    with sqlite3.connect(SQLITE_PATH) as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                prompt TEXT NOT NULL,
                language TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS generations (
                id TEXT PRIMARY KEY,
                project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
                code TEXT NOT NULL,
                security_score INTEGER NOT NULL,
                findings TEXT NOT NULL,
                embedding TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
    print("database.py: SQLite setup completed successfully.")

def create_project(project_id: str, name: str, prompt: str, language: str):
    """
    Creates or updates a project record.
    """
    if USE_POSTGRES:
        try:
            with psycopg.connect(DATABASE_URL) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO projects (id, name, prompt, language, updated_at)
                        VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name,
                            prompt = EXCLUDED.prompt,
                            language = EXCLUDED.language,
                            updated_at = CURRENT_TIMESTAMP;
                        """,
                        (project_id, name, prompt, language)
                    )
                conn.commit()
            return
        except Exception as e:
            print(f"database.py WARNING: PostgreSQL insert failed ({e}), falling back to SQLite")
            
    # SQLite Fallback
    with sqlite3.connect(SQLITE_PATH) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO projects (id, name, prompt, language, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                name = excluded.name,
                prompt = excluded.prompt,
                language = excluded.language,
                updated_at = CURRENT_TIMESTAMP;
            """,
            (project_id, name, prompt, language)
        )
        conn.commit()

def delete_project(project_id: str) -> bool:
    """
    Deletes a project and all its generations.
    """
    if USE_POSTGRES:
        try:
            with psycopg.connect(DATABASE_URL) as conn:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM generations WHERE project_id = %s;", (project_id,))
                    cur.execute("DELETE FROM projects WHERE id = %s;", (project_id,))
                conn.commit()
            return True
        except Exception as e:
            print(f"database.py WARNING: PostgreSQL delete failed ({e}), falling back to SQLite")

    with sqlite3.connect(SQLITE_PATH) as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM generations WHERE project_id = ?;", (project_id,))
        cur.execute("DELETE FROM projects WHERE id = ?;", (project_id,))
        conn.commit()
    return True

def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves a project by ID.
    """
    if USE_POSTGRES:
        try:
            with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM projects WHERE id = %s;", (project_id,))
                    return cur.fetchone()
        except Exception as e:
            print(f"database.py WARNING: PostgreSQL select failed ({e}), using SQLite fallback")

    with sqlite3.connect(SQLITE_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM projects WHERE id = ?;", (project_id,))
        row = cur.fetchone()
        return dict(row) if row else None

def get_all_projects() -> List[Dict[str, Any]]:
    """
    Retrieves all projects ordered by updated_at descending.
    """
    if USE_POSTGRES:
        try:
            with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM projects ORDER BY updated_at DESC;")
                    return cur.fetchall()
        except Exception as e:
            print(f"database.py WARNING: PostgreSQL select failed ({e}), using SQLite fallback")

    with sqlite3.connect(SQLITE_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM projects ORDER BY updated_at DESC;")
        return [dict(r) for r in cur.fetchall()]

def create_generation(project_id: str, code: str, security_score: int, findings: List[Any], embedding: List[float]):
    """
    Saves a generation run, referencing a project.
    """
    gen_id = str(uuid.uuid4())
    findings_str = json.dumps(findings)
    
    if USE_POSTGRES:
        try:
            with psycopg.connect(DATABASE_URL) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO generations (id, project_id, code, security_score, findings, embedding)
                        VALUES (%s, %s, %s, %s, %s, %s);
                        """,
                        (gen_id, project_id, code, security_score, findings_str, embedding)
                    )
                    cur.execute(
                        "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = %s;",
                        (project_id,)
                    )
                conn.commit()
            return
        except Exception as e:
            print(f"database.py WARNING: PostgreSQL insert failed ({e}), falling back to SQLite")

    # SQLite fallback
    embedding_str = json.dumps(embedding) if embedding else None
    with sqlite3.connect(SQLITE_PATH) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO generations (id, project_id, code, security_score, findings, embedding)
            VALUES (?, ?, ?, ?, ?, ?);
            """,
            (gen_id, project_id, code, security_score, findings_str, embedding_str)
        )
        cur.execute(
            "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?;",
            (project_id,)
        )
        conn.commit()

def get_project_generations(project_id: str) -> List[Dict[str, Any]]:
    """
    Retrieves all generations for a given project_id.
    """
    if USE_POSTGRES:
        try:
            with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM generations WHERE project_id = %s ORDER BY created_at DESC;", (project_id,))
                    res = cur.fetchall()
                    for row in res:
                        if isinstance(row["findings"], str):
                            row["findings"] = json.loads(row["findings"])
                    return res
        except Exception as e:
            print(f"database.py WARNING: PostgreSQL select failed ({e}), using SQLite fallback")

    with sqlite3.connect(SQLITE_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM generations WHERE project_id = ? ORDER BY created_at DESC;", (project_id,))
        res = []
        for row in cur.fetchall():
            d = dict(row)
            d["findings"] = json.loads(d["findings"])
            if d.get("embedding"):
                d["embedding"] = json.loads(d["embedding"])
            res.append(d)
        return res

def get_best_generation(project_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves the highest scoring generation for a given project_id.
    """
    if USE_POSTGRES:
        try:
            with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT * FROM generations 
                        WHERE project_id = %s 
                        ORDER BY security_score DESC, created_at DESC 
                        LIMIT 1;
                        """,
                        (project_id,)
                    )
                    row = cur.fetchone()
                    if row:
                        if isinstance(row["findings"], str):
                            row["findings"] = json.loads(row["findings"])
                        return row
                    return None
        except Exception as e:
            print(f"database.py WARNING: PostgreSQL select failed ({e}), using SQLite fallback")

    with sqlite3.connect(SQLITE_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            """
            SELECT * FROM generations 
            WHERE project_id = ? 
            ORDER BY security_score DESC, created_at DESC 
            LIMIT 1;
            """,
            (project_id,)
        )
        row = cur.fetchone()
        if row:
            d = dict(row)
            d["findings"] = json.loads(d["findings"])
            if d.get("embedding"):
                d["embedding"] = json.loads(d["embedding"])
            return d
        return None

def get_latest_generation(project_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves the most recently created generation for a given project_id.
    """
    if USE_POSTGRES:
        try:
            with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT * FROM generations 
                        WHERE project_id = %s 
                        ORDER BY created_at DESC 
                        LIMIT 1;
                        """,
                        (project_id,)
                    )
                    row = cur.fetchone()
                    if row:
                        if isinstance(row["findings"], str):
                            row["findings"] = json.loads(row["findings"])
                        return row
                    return None
        except Exception as e:
            print(f"database.py WARNING: PostgreSQL select failed ({e}), using SQLite fallback")

    with sqlite3.connect(SQLITE_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            """
            SELECT * FROM generations 
            WHERE project_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1;
            """,
            (project_id,)
        )
        row = cur.fetchone()
        if row:
            d = dict(row)
            d["findings"] = json.loads(d["findings"])
            if d.get("embedding"):
                d["embedding"] = json.loads(d["embedding"])
            return d
        return None


def find_similar_generation(target_embedding: List[float], threshold: float = 0.95) -> Optional[Dict[str, Any]]:
    """
    Looks across all generations for a prompt whose embedding matches the target
    embedding above the threshold (defaults to 95% similarity).
    """
    if not target_embedding:
        return None

    if USE_POSTGRES:
        try:
            # Cosine similarity is 1 - (embedding <=> %s::vector)
            with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT g.*, p.prompt, p.language,
                               (1 - (g.embedding <=> %s::vector)) as similarity
                        FROM generations g
                        JOIN projects p ON g.project_id = p.id
                        WHERE (1 - (g.embedding <=> %s::vector)) >= %s
                        ORDER BY similarity DESC, g.security_score DESC
                        LIMIT 1;
                        """,
                        (target_embedding, target_embedding, threshold)
                    )
                    row = cur.fetchone()
                    if row:
                        if isinstance(row["findings"], str):
                            row["findings"] = json.loads(row["findings"])
                        return row
                    return None
        except Exception as e:
            print(f"database.py WARNING: PostgreSQL pgvector search failed ({e}), using SQLite fallback")

    # SQLite / Manual cosine similarity implementation
    def cosine_similarity(v1: List[float], v2: List[float]) -> float:
        if not v1 or not v2 or len(v1) != len(v2):
            return 0.0
        dot_product = sum(a * b for a, b in zip(v1, v2))
        mag1 = math.sqrt(sum(a * a for a in v1))
        mag2 = math.sqrt(sum(a * a for a in v2))
        if mag1 == 0 or mag2 == 0:
            return 0.0
        return dot_product / (mag1 * mag2)

    with sqlite3.connect(SQLITE_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            """
            SELECT g.*, p.prompt, p.language
            FROM generations g
            JOIN projects p ON g.project_id = p.id;
            """
        )
        rows = cur.fetchall()
        
        best_match = None
        best_similarity = -1.0
        
        for row in rows:
            d = dict(row)
            if not d.get("embedding"):
                continue
            try:
                emb = json.loads(d["embedding"])
                sim = cosine_similarity(emb, target_embedding)
                if sim >= threshold and sim > best_similarity:
                    best_similarity = sim
                    d["similarity"] = sim
                    d["findings"] = json.loads(d["findings"])
                    d["embedding"] = emb
                    best_match = d
            except Exception as e:
                print(f"database.py WARNING: Failed to parse sqlite embedding vector ({e})")
                continue
                
        return best_match


def rename_project(old_id: str, new_id: str) -> bool:
    """
    Renames a project ID in the database and updates associated generations.
    """
    if USE_POSTGRES:
        try:
            with psycopg.connect(DATABASE_URL) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT name, prompt, language FROM projects WHERE id = %s;", (old_id,))
                    row = cur.fetchone()
                    if not row:
                        return False
                    name, prompt, language = row
                    new_name = name.replace(old_id.replace("project_", ""), new_id.replace("project_", ""))
                    
                    cur.execute(
                        "INSERT INTO projects (id, name, prompt, language) VALUES (%s, %s, %s, %s);",
                        (new_id, new_name, prompt, language)
                    )
                    cur.execute(
                        "UPDATE generations SET project_id = %s WHERE project_id = %s;",
                        (new_id, old_id)
                    )
                    cur.execute("DELETE FROM projects WHERE id = %s;", (old_id,))
                conn.commit()
            return True
        except Exception as e:
            print(f"database.py WARNING: PostgreSQL rename failed ({e})")
            return False

    # SQLite Fallback
    with sqlite3.connect(SQLITE_PATH) as conn:
        cur = conn.cursor()
        cur.execute("SELECT name, prompt, language FROM projects WHERE id = ?;", (old_id,))
        row = cur.fetchone()
        if not row:
            return False
        name, prompt, language = row
        new_name = name.replace(old_id.replace("project_", ""), new_id.replace("project_", ""))

        cur.execute("PRAGMA foreign_keys = OFF;")
        cur.execute(
            "INSERT INTO projects (id, name, prompt, language) VALUES (?, ?, ?, ?);",
            (new_id, new_name, prompt, language)
        )
        cur.execute(
            "UPDATE generations SET project_id = ? WHERE project_id = ?;",
            (new_id, old_id)
        )
        cur.execute("DELETE FROM projects WHERE id = ?;", (old_id,))
        cur.execute("PRAGMA foreign_keys = ON;")
        conn.commit()
    return True
