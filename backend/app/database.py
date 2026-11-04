import sqlite3
import os
from pathlib import Path

# SQLite database file path
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get("EVEN_DB_PATH", str(BASE_DIR / "even.db"))

def get_db_connection() -> sqlite3.Connection:
    """Returns a SQLite connection with row access by column name."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Enable Write-Ahead Logging for fast concurrent read/write performance
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def init_db() -> None:
    """Initializes the database schema if tables do not exist and applies migrations."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hazards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hazard_type TEXT NOT NULL,
            severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            description TEXT NOT NULL,
            reported_at TEXT NOT NULL,
            confirmation_status TEXT NOT NULL DEFAULT 'unconfirmed',
            confidence REAL NOT NULL DEFAULT 0.75,
            source TEXT NOT NULL DEFAULT 'rider_manual',
            image_path TEXT,
            corroboration_count INTEGER NOT NULL DEFAULT 0,
            status_reason TEXT,
            location_accuracy REAL,
            location_timestamp TEXT,
            location_source TEXT DEFAULT 'manual',
            resolved_address TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
    """)

    # Safe migration for existing SQLite databases
    cursor.execute("PRAGMA table_info(hazards);")
    existing_cols = [col[1] for col in cursor.fetchall()]
    if "corroboration_count" not in existing_cols:
        cursor.execute("ALTER TABLE hazards ADD COLUMN corroboration_count INTEGER NOT NULL DEFAULT 0;")
    if "status_reason" not in existing_cols:
        cursor.execute("ALTER TABLE hazards ADD COLUMN status_reason TEXT;")
    if "location_accuracy" not in existing_cols:
        cursor.execute("ALTER TABLE hazards ADD COLUMN location_accuracy REAL;")
    if "location_timestamp" not in existing_cols:
        cursor.execute("ALTER TABLE hazards ADD COLUMN location_timestamp TEXT;")
    if "location_source" not in existing_cols:
        cursor.execute("ALTER TABLE hazards ADD COLUMN location_source TEXT DEFAULT 'manual';")
    if "resolved_address" not in existing_cols:
        cursor.execute("ALTER TABLE hazards ADD COLUMN resolved_address TEXT;")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hazards_type ON hazards(hazard_type);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hazards_severity ON hazards(severity);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hazards_status ON hazards(confirmation_status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hazards_coords ON hazards(latitude, longitude);")
    conn.commit()
    conn.close()
