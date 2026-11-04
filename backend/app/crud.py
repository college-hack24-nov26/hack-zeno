import sqlite3
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from backend.app.schemas import HazardCreate, HazardUpdate
from backend.app.confirmation_engine import evaluate_hazard_corroboration, DISTANCE_THRESHOLD_METERS, haversine_distance_meters

def row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    """Convert a sqlite3.Row to a plain dictionary."""
    return {key: row[key] for key in row.keys()}

def get_hazard_by_id(conn: sqlite3.Connection, hazard_id: int) -> Optional[Dict[str, Any]]:
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM hazards WHERE id = ?", (hazard_id,))
    row = cursor.fetchone()
    return row_to_dict(row) if row else None

def get_hazards(
    conn: sqlite3.Connection,
    hazard_type: Optional[str] = None,
    severity: Optional[str] = None,
    confirmation_status: Optional[str] = None,
    limit: int = 200,
    offset: int = 0
) -> List[Dict[str, Any]]:
    cursor = conn.cursor()
    query = "SELECT * FROM hazards WHERE 1=1"
    params = []

    if hazard_type and hazard_type != "all":
        query += " AND hazard_type = ?"
        params.append(hazard_type)
    if severity and severity != "all":
        query += " AND severity = ?"
        params.append(severity)
    if confirmation_status and confirmation_status != "all":
        query += " AND confirmation_status = ?"
        params.append(confirmation_status)

    query += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = cursor.fetchall()
    return [row_to_dict(r) for r in rows]

def count_hazards(conn: sqlite3.Connection) -> int:
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM hazards")
    return cursor.fetchone()[0]

def create_hazard(conn: sqlite3.Connection, hazard: HazardCreate) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    reported_at = hazard.reported_at or now

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO hazards (
            hazard_type, severity, latitude, longitude, description,
            reported_at, confirmation_status, confidence, source,
            image_path, corroboration_count, status_reason,
            location_accuracy, location_timestamp, location_source, resolved_address,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        hazard.hazard_type,
        hazard.severity,
        hazard.latitude,
        hazard.longitude,
        hazard.description,
        reported_at,
        hazard.confirmation_status,
        hazard.confidence,
        hazard.source,
        hazard.image_path,
        hazard.corroboration_count or 0,
        hazard.status_reason or "Pending Road Memory spatial verification.",
        hazard.location_accuracy,
        hazard.location_timestamp,
        hazard.location_source or "manual",
        hazard.resolved_address,
        now,
        now
    ))
    conn.commit()
    new_id = cursor.lastrowid

    # Run confirmation engine on the new hazard and all nearby hazards
    status, conf, count, reason = evaluate_hazard_corroboration(conn, new_id)
    cursor.execute("""
        UPDATE hazards
        SET confirmation_status = ?, confidence = ?, corroboration_count = ?, status_reason = ?
        WHERE id = ?
    """, (status, conf, count, reason, new_id))

    # Also re-evaluate any nearby hazards whose status might now be corroborated!
    cursor.execute("SELECT id, latitude, longitude FROM hazards WHERE id != ? AND confirmation_status != 'resolved'", (new_id,))
    others = cursor.fetchall()
    for other in others:
        dist = haversine_distance_meters(hazard.latitude, hazard.longitude, float(other["latitude"]), float(other["longitude"]))
        if dist <= DISTANCE_THRESHOLD_METERS:
            o_status, o_conf, o_count, o_reason = evaluate_hazard_corroboration(conn, other["id"])
            cursor.execute("""
                UPDATE hazards
                SET confirmation_status = ?, confidence = ?, corroboration_count = ?, status_reason = ?
                WHERE id = ?
            """, (o_status, o_conf, o_count, o_reason, other["id"]))

    conn.commit()
    return get_hazard_by_id(conn, new_id)

def update_hazard(conn: sqlite3.Connection, hazard_id: int, update_data: HazardUpdate) -> Optional[Dict[str, Any]]:
    existing = get_hazard_by_id(conn, hazard_id)
    if not existing:
        return None

    update_dict = update_data.model_dump(exclude_unset=True)
    if not update_dict:
        return existing

    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()

    fields = []
    params = []
    for key, value in update_dict.items():
        fields.append(f"{key} = ?")
        params.append(value)
    params.append(hazard_id)

    sql = f"UPDATE hazards SET {', '.join(fields)} WHERE id = ?"
    cursor = conn.cursor()
    cursor.execute(sql, params)
    conn.commit()

    # If status or coordinates were updated, re-evaluate corroboration
    if "confirmation_status" not in update_dict or update_dict["confirmation_status"] != "resolved":
        status, conf, count, reason = evaluate_hazard_corroboration(conn, hazard_id)
        cursor.execute("""
            UPDATE hazards
            SET confirmation_status = ?, confidence = ?, corroboration_count = ?, status_reason = ?
            WHERE id = ?
        """, (status, conf, count, reason, hazard_id))
        conn.commit()

    return get_hazard_by_id(conn, hazard_id)

def delete_hazard(conn: sqlite3.Connection, hazard_id: int) -> bool:
    target = get_hazard_by_id(conn, hazard_id)
    if not target:
        return False

    cursor = conn.cursor()
    cursor.execute("DELETE FROM hazards WHERE id = ?", (hazard_id,))
    deleted = cursor.rowcount > 0
    conn.commit()

    # Re-evaluate remaining hazards in the area if target was deleted
    cursor.execute("SELECT id, latitude, longitude FROM hazards WHERE confirmation_status != 'resolved'")
    for other in cursor.fetchall():
        dist = haversine_distance_meters(target["latitude"], target["longitude"], float(other["latitude"]), float(other["longitude"]))
        if dist <= DISTANCE_THRESHOLD_METERS:
            o_status, o_conf, o_count, o_reason = evaluate_hazard_corroboration(conn, other["id"])
            cursor.execute("""
                UPDATE hazards
                SET confirmation_status = ?, confidence = ?, corroboration_count = ?, status_reason = ?
                WHERE id = ?
            """, (o_status, o_conf, o_count, o_reason, other["id"]))
    conn.commit()

    return deleted

def get_analytics_summary(conn: sqlite3.Connection) -> Dict[str, Any]:
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM hazards")
    total = cursor.fetchone()[0]

    cursor.execute("""
        SELECT severity, COUNT(*) as count 
        FROM hazards 
        GROUP BY severity
    """)
    severity_breakdown = {row[0]: row[1] for row in cursor.fetchall()}

    cursor.execute("""
        SELECT hazard_type, COUNT(*) as count 
        FROM hazards 
        GROUP BY hazard_type
    """)
    type_breakdown = {row[0]: row[1] for row in cursor.fetchall()}

    cursor.execute("""
        SELECT confirmation_status, COUNT(*) as count 
        FROM hazards 
        GROUP BY confirmation_status
    """)
    status_breakdown = {row[0]: row[1] for row in cursor.fetchall()}

    cursor.execute("SELECT * FROM hazards ORDER BY id DESC LIMIT 5")
    recent = [row_to_dict(r) for r in cursor.fetchall()]

    return {
        "total_hazards": total,
        "critical_count": severity_breakdown.get("critical", 0),
        "high_count": severity_breakdown.get("high", 0),
        "medium_count": severity_breakdown.get("medium", 0),
        "low_count": severity_breakdown.get("low", 0),
        "confirmed_count": status_breakdown.get("confirmed", 0),
        "unconfirmed_count": status_breakdown.get("unconfirmed", 0),
        "resolved_count": status_breakdown.get("resolved", 0),
        "active_riders_simulated": 14,
        "severity_breakdown": severity_breakdown,
        "type_breakdown": type_breakdown,
        "recent_activity": recent
    }
