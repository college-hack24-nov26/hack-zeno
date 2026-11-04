from fastapi import APIRouter
from typing import Dict, Any, List
from backend.app.database import get_db_connection
from backend.app import crud
from backend.app.schemas import HazardSummary
from backend.app.confirmation_engine import haversine_distance_meters

router = APIRouter(prefix="/api/analytics", tags=["Analytics & Urban Intelligence"])

@router.get("/overview", response_model=HazardSummary)
def get_overview_analytics():
    """Returns high-level statistics for the main dashboard."""
    conn = get_db_connection()
    try:
        summary = crud.get_analytics_summary(conn)
        return summary
    finally:
        conn.close()

@router.get("/urban-intelligence")
def get_urban_intelligence_data():
    """
    Returns aggregated metrics for city stakeholders:
    - Real road maintenance priority queue
    - Real spatial high-risk hazard clusters (grouped from SQLite GPS points)
    - Real reporting trends over time
    - Real distribution by hazard type and severity
    - Clearly labeled municipal planning demo layers
    """
    conn = get_db_connection()
    try:
        hazards = crud.get_hazards(conn, limit=500)

        # 1. Calculate Real Maintenance Priority Queue
        severity_weights = {
            "critical": 10.0,
            "high": 6.5,
            "medium": 3.5,
            "low": 1.5
        }

        priority_queue = []
        for h in hazards:
            if h["confirmation_status"] == "resolved":
                continue
            weight = severity_weights.get(h["severity"], 2.0)
            corrob_multiplier = 1.0 + (min(h.get("corroboration_count", 0), 4) * 0.15)
            confidence = h["confidence"] or 0.75
            priority_score = round(weight * confidence * corrob_multiplier * 10, 1)

            priority_queue.append({
                "hazard_id": h["id"],
                "hazard_type": h["hazard_type"],
                "severity": h["severity"],
                "latitude": h["latitude"],
                "longitude": h["longitude"],
                "description": h["description"],
                "confirmation_status": h["confirmation_status"],
                "confidence": confidence,
                "corroboration_count": h.get("corroboration_count", 0),
                "status_reason": h.get("status_reason", ""),
                "reported_at": h["reported_at"],
                "priority_score": priority_score,
                "recommended_action": (
                    "Immediate Patch & Barricade" if h["severity"] == "critical"
                    else "Inspect within 48h" if h["severity"] == "high"
                    else "Routine Resurfacing Queue"
                )
            })

        priority_queue.sort(key=lambda x: x["priority_score"], reverse=True)

        # 2. Real High-Risk Geographic Clusters (calculated from actual SQLite coordinates)
        clusters = []
        visited = set()
        active_hazards = [h for h in hazards if h["confirmation_status"] != "resolved"]

        for i, h1 in enumerate(active_hazards):
            if h1["id"] in visited:
                continue

            current_cluster = [h1]
            visited.add(h1["id"])

            for j, h2 in enumerate(active_hazards):
                if i != j and h2["id"] not in visited:
                    dist = haversine_distance_meters(
                        float(h1["latitude"]), float(h1["longitude"]),
                        float(h2["latitude"]), float(h2["longitude"])
                    )
                    if dist <= 200.0:  # 200m spatial corridor
                        current_cluster.append(h2)
                        visited.add(h2["id"])

            if len(current_cluster) >= 1:
                avg_lat = sum(float(h["latitude"]) for h in current_cluster) / len(current_cluster)
                avg_lng = sum(float(h["longitude"]) for h in current_cluster) / len(current_cluster)
                has_critical = any(h["severity"] == "critical" for h in current_cluster)
                types = [h["hazard_type"] for h in current_cluster]
                primary_type = max(set(types), key=types.count)

                clusters.append({
                    "cluster_id": len(clusters) + 1,
                    "center_latitude": round(avg_lat, 5),
                    "center_longitude": round(avg_lng, 5),
                    "hazard_count": len(current_cluster),
                    "has_critical": has_critical,
                    "primary_type": primary_type,
                    "hazard_ids": [h["id"] for h in current_cluster],
                    "risk_level": "Severe Hotspot" if (len(current_cluster) > 1 and has_critical) else "Elevated Watch" if has_critical else "Moderate Corridor"
                })

        clusters.sort(key=lambda c: (c["hazard_count"], c["has_critical"]), reverse=True)

        # 3. Real Report Trends by Day
        cursor = conn.cursor()
        cursor.execute("""
            SELECT substr(reported_at, 1, 10) as report_date, COUNT(*) as count
            FROM hazards
            GROUP BY report_date
            ORDER BY report_date DESC
            LIMIT 7
        """)
        report_trends = [{"date": row[0], "count": row[1]} for row in cursor.fetchall()]

        # 4. Real Hazard Breakdown
        cursor.execute("SELECT hazard_type, COUNT(*) FROM hazards GROUP BY hazard_type ORDER BY COUNT(*) DESC")
        type_distribution = {row[0]: row[1] for row in cursor.fetchall()}

        cursor.execute("SELECT severity, COUNT(*) FROM hazards GROUP BY severity")
        severity_distribution = {row[0]: row[1] for row in cursor.fetchall()}

        # 5. Clearly Labeled Municipal Sample Planning Templates
        sample_sectors = [
            {
                "zone": "Ward 4 — Central Viaduct",
                "road_condition_index": "Poor (42/100)",
                "planning_note": "Sample municipal boundary polygon for demonstration.",
                "data_mode": "SAMPLE_DEMO_DATA"
            },
            {
                "zone": "Ward 9 — Industrial Bypass",
                "road_condition_index": "Moderate (64/100)",
                "planning_note": "Sample municipal boundary polygon for demonstration.",
                "data_mode": "SAMPLE_DEMO_DATA"
            },
            {
                "zone": "Ward 2 — Metro Transit Corridor",
                "road_condition_index": "Good (81/100)",
                "planning_note": "Sample municipal boundary polygon for demonstration.",
                "data_mode": "SAMPLE_DEMO_DATA"
            }
        ]

        return {
            "total_active_hazards": len(priority_queue),
            "priority_maintenance_queue": priority_queue[:15],
            "real_spatial_clusters": clusters,
            "report_trends": report_trends,
            "type_distribution": type_distribution,
            "severity_distribution": severity_distribution,
            "municipal_sectors_sample": sample_sectors,
            "data_source_badge": "LIVE_DATABASE_AGGREGATION"
        }
    finally:
        conn.close()
