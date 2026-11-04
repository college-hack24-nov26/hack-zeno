"""
Road Memory Confirmation Engine
================================
A deterministic, explainable algorithm that detects and links nearby reports
of the same road hazard based on geographic distance (Haversine) and time windows.

Key rules:
1. Two reports are considered corroborated if:
   - Distance <= DISTANCE_THRESHOLD_METERS (default: 75.0m)
   - Time window <= TIME_THRESHOLD_HOURS (default: 168.0h / 7 days)
   - Hazard types are identical or compatible (e.g. pothole + broken surface)
2. A single report with no corroboration is strictly labeled "unconfirmed" (Unverified).
3. The engine never fakes multiple confirmations and writes an exact human-readable
   explanation into `status_reason` (e.g. "Corroborated by 2 reports within 45m").
"""

import math
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple
import sqlite3

DISTANCE_THRESHOLD_METERS = 75.0  # 75 meters detection radius
TIME_THRESHOLD_HOURS = 168.0       # 7 days time window

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates great-circle distance between two GPS coordinates in meters
    using the Haversine formula.
    """
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def parse_iso_time(iso_str: str) -> datetime:
    """Safely parses ISO 8601 strings into timezone-aware datetime."""
    try:
        clean_str = iso_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)

def are_types_compatible(type1: str, type2: str) -> bool:
    """
    Checks if two reported hazard classifications represent the same physical condition.
    """
    if type1 == type2:
        return True

    # Compatible groups representing identical physical road hazards
    groups = [
        {"pothole", "broken_surface", "unsafe_condition"},
        {"obstacle", "debris", "unsafe_condition", "roadblock"},
        {"oil_spill", "unsafe_condition"},
        {"gravel", "debris", "unsafe_condition"},
        {"waterlogging", "unsafe_condition"},
        {"roadblock", "road_works", "obstacle"}
    ]
    for g in groups:
        if type1 in g and type2 in g:
            return True
    return False

def evaluate_hazard_corroboration(
    conn: sqlite3.Connection,
    hazard_id: int,
    distance_threshold: float = DISTANCE_THRESHOLD_METERS,
    time_threshold_hours: float = TIME_THRESHOLD_HOURS
) -> Tuple[str, float, int, str]:
    """
    Evaluates corroboration for a single hazard against all active hazards in the database.
    Returns:
        (new_status, new_confidence, corroboration_count, status_reason)
    """
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM hazards WHERE id = ?", (hazard_id,))
    target = cursor.fetchone()
    if not target:
        return ("unconfirmed", 0.70, 0, "Hazard record not found.")

    # If already resolved by a road safety technician, preserve resolved state
    if target["confirmation_status"] == "resolved":
        count = target["corroboration_count"] if "corroboration_count" in target.keys() else 0
        return (
            "resolved",
            target["confidence"] or 0.85,
            count or 0,
            "Resolved: Hazard marked as repaired or cleared from roadway."
        )

    target_time = parse_iso_time(target["reported_at"])
    target_lat = float(target["latitude"])
    target_lng = float(target["longitude"])
    target_type = target["hazard_type"]

    cursor.execute("SELECT * FROM hazards WHERE id != ? AND confirmation_status != 'resolved'", (hazard_id,))
    others = cursor.fetchall()

    corroborating_reports = []
    for other in others:
        if not are_types_compatible(target_type, other["hazard_type"]):
            continue

        dist = haversine_distance_meters(target_lat, target_lng, float(other["latitude"]), float(other["longitude"]))
        if dist <= distance_threshold:
            other_time = parse_iso_time(other["reported_at"])
            hours_diff = abs((target_time - other_time).total_seconds()) / 3600.0
            if hours_diff <= time_threshold_hours:
                corroborating_reports.append({
                    "id": other["id"],
                    "hazard_type": other["hazard_type"],
                    "distance_m": round(dist, 1),
                    "hours_diff": round(hours_diff, 1)
                })

    count = len(corroborating_reports)
    if count >= 1:
        new_status = "confirmed"  # Corroborated
        base_conf = target["confidence"] or 0.75
        new_conf = min(0.99, round(max(base_conf, 0.75) + (count * 0.10), 2))
        closest = min(corroborating_reports, key=lambda x: x["distance_m"])
        reason = (
            f"Corroborated by {count} matching report(s) within {int(distance_threshold)}m "
            f"(closest: {closest['distance_m']}m away, report #{closest['id']})."
        )
    else:
        new_status = "unconfirmed"  # Unverified
        new_conf = round(target["confidence"] or 0.75, 2)
        reason = (
            f"Unverified single report. No second report within {int(distance_threshold)}m "
            f"in the last {int(time_threshold_hours // 24)} days."
        )

    return (new_status, new_conf, count, reason)

def recalculate_all_corroborations(conn: sqlite3.Connection) -> int:
    """
    Iterates over all non-resolved hazards and updates corroboration count,
    confidence, and status reason. Returns number of updated rows.
    """
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM hazards")
    ids = [row[0] for row in cursor.fetchall()]

    updated_count = 0
    for hid in ids:
        status, conf, count, reason = evaluate_hazard_corroboration(conn, hid)
        cursor.execute("""
            UPDATE hazards
            SET confirmation_status = ?, confidence = ?, corroboration_count = ?, status_reason = ?
            WHERE id = ?
        """, (status, conf, count, reason, hid))
        updated_count += 1

    conn.commit()
    return updated_count
