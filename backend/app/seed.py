import sqlite3
from datetime import datetime, timezone, timedelta

SAMPLE_HAZARDS = [
    # Corroborated Pair 1: Bridge Ramp Pothole (Hazards 1 & 2 are 28m apart)
    {
        "hazard_type": "pothole",
        "severity": "critical",
        "latitude": 18.5204,
        "longitude": 73.8567,
        "description": "Deep 18cm pothole on right wheel track near bridge ramp. High rim strike risk for two-wheelers.",
        "confirmation_status": "confirmed",
        "confidence": 0.88,
        "source": "rider_manual",
        "image_path": "frame_pothole_01.jpg",
        "corroboration_count": 1,
        "status_reason": "Corroborated by 1 matching report 28m away.",
        "minutes_ago": 25
    },
    {
        "hazard_type": "pothole",
        "severity": "critical",
        "latitude": 18.5206,
        "longitude": 73.8569,
        "description": "Submerged crater next to bridge expansion joint. Multiple riders swerving into traffic.",
        "confirmation_status": "confirmed",
        "confidence": 0.86,
        "source": "rider_manual",
        "image_path": "frame_pothole_01.jpg",
        "corroboration_count": 1,
        "status_reason": "Corroborated by 1 matching report 28m away.",
        "minutes_ago": 15
    },

    # Corroborated Pair 2: Roundabout Oil Spill (Hazards 3 & 4 are 31m apart)
    {
        "hazard_type": "oil_spill",
        "severity": "critical",
        "latitude": 18.5284,
        "longitude": 73.8740,
        "description": "Dense commercial bus diesel slick across curve exit near bus terminal. Severe skid risk.",
        "confirmation_status": "confirmed",
        "confidence": 0.90,
        "source": "rider_manual",
        "image_path": "frame_oil_02.jpg",
        "corroboration_count": 1,
        "status_reason": "Corroborated by 1 matching report 31m away.",
        "minutes_ago": 45
    },
    {
        "hazard_type": "unsafe_condition",
        "severity": "high",
        "latitude": 18.5286,
        "longitude": 73.8742,
        "description": "Slippery wet asphalt and petroleum runoff on roundabout outer lane.",
        "confirmation_status": "confirmed",
        "confidence": 0.84,
        "source": "rider_manual",
        "image_path": "frame_oil_02.jpg",
        "corroboration_count": 1,
        "status_reason": "Corroborated by 1 matching report 31m away.",
        "minutes_ago": 30
    },

    # Isolated Unverified Single Report 1: Unmarked Speed Bump
    {
        "hazard_type": "unmarked_speed_bump",
        "severity": "high",
        "latitude": 18.5362,
        "longitude": 73.8301,
        "description": "Steep unpainted asphalt speed bump in shaded corridor. Sudden pitch hazard at >30km/h.",
        "confirmation_status": "unconfirmed",
        "confidence": 0.75,
        "source": "rider_manual",
        "image_path": "frame_bump_03.jpg",
        "corroboration_count": 0,
        "status_reason": "Unverified single report. No second report within 75m.",
        "minutes_ago": 120
    },

    # Isolated Unverified Single Report 2: Loose Gravel
    {
        "hazard_type": "gravel",
        "severity": "high",
        "latitude": 18.5110,
        "longitude": 73.8445,
        "description": "Loose coarse aggregate spilled from construction dump truck on roundabout corner apex.",
        "confirmation_status": "unconfirmed",
        "confidence": 0.72,
        "source": "rider_manual",
        "image_path": "frame_gravel_04.jpg",
        "corroboration_count": 0,
        "status_reason": "Unverified single report. No second report within 75m.",
        "minutes_ago": 180
    },

    # Corroborated Pair 3: Roadblock / Trench Construction (Hazards 7 & 8 are 42m apart)
    {
        "hazard_type": "roadblock",
        "severity": "critical",
        "latitude": 18.5320,
        "longitude": 73.8490,
        "description": "Unlit trench excavation partially barricaded with broken tape, blocking left riding corridor.",
        "confirmation_status": "confirmed",
        "confidence": 0.92,
        "source": "rider_manual",
        "image_path": "frame_works_07.jpg",
        "corroboration_count": 1,
        "status_reason": "Corroborated by 1 matching report 42m away.",
        "minutes_ago": 240
    },
    {
        "hazard_type": "obstacle",
        "severity": "high",
        "latitude": 18.5323,
        "longitude": 73.8493,
        "description": "Exposed steel excavation plate and concrete curb barrier encroaching into lane.",
        "confirmation_status": "confirmed",
        "confidence": 0.86,
        "source": "rider_manual",
        "image_path": "frame_works_07.jpg",
        "corroboration_count": 1,
        "status_reason": "Corroborated by 1 matching report 42m away.",
        "minutes_ago": 210
    },

    # Isolated Unverified Single Report 3: Waterlogging
    {
        "hazard_type": "waterlogging",
        "severity": "high",
        "latitude": 18.5020,
        "longitude": 73.8610,
        "description": "12cm standing water obscuring sunken utility trench near metro pillar.",
        "confirmation_status": "unconfirmed",
        "confidence": 0.78,
        "source": "rider_manual",
        "image_path": "frame_water_06.jpg",
        "corroboration_count": 0,
        "status_reason": "Unverified single report. No second report within 75m.",
        "minutes_ago": 360
    },

    # Resolved Hazard: Debris Cleared
    {
        "hazard_type": "debris",
        "severity": "medium",
        "latitude": 18.5180,
        "longitude": 73.8290,
        "description": "Shredded commercial tire retread strip lying in fast lane. Cleared by roadside patrol.",
        "confirmation_status": "resolved",
        "confidence": 0.85,
        "source": "rider_manual",
        "image_path": "frame_debris_08.jpg",
        "corroboration_count": 0,
        "status_reason": "Resolved: Hazard marked as repaired or cleared from roadway.",
        "minutes_ago": 480
    }
]

def seed_database_if_empty(conn: sqlite3.Connection) -> int:
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM hazards")
    count = cursor.fetchone()[0]
    if count > 0:
        return 0

    base_time = datetime.now(timezone.utc)
    inserted = 0

    for item in SAMPLE_HAZARDS:
        reported_dt = base_time - timedelta(minutes=item["minutes_ago"])
        reported_iso = reported_dt.isoformat()
        created_iso = reported_iso

        cursor.execute("""
            INSERT INTO hazards (
                hazard_type, severity, latitude, longitude, description,
                reported_at, confirmation_status, confidence, source,
                image_path, corroboration_count, status_reason, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item["hazard_type"],
            item["severity"],
            item["latitude"],
            item["longitude"],
            item["description"],
            reported_iso,
            item["confirmation_status"],
            item["confidence"],
            item["source"],
            item["image_path"],
            item["corroboration_count"],
            item["status_reason"],
            created_iso,
            created_iso
        ))
        inserted += 1

    conn.commit()
    return inserted
