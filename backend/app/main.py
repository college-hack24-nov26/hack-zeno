import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.app.database import init_db, get_db_connection
from backend.app.seed import seed_database_if_empty
from backend.app.confirmation_engine import recalculate_all_corroborations
from backend.app.schemas import HealthResponse
from backend.app import crud
from backend.app.routes.hazards import router as hazards_router
from backend.app.routes.analytics import router as analytics_router
from backend.app.routes.detection import router as detection_router
from backend.app.routes.geocoding import router as geocoding_router
from backend.app.routes.weather import router as weather_router
from backend.app import detector

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("even.core")

# Ensure uploads directory exists
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure DB schema and initial seed data
    logger.info("Initializing EVEN SQLite Database...")
    init_db()
    conn = get_db_connection()
    try:
        inserted = seed_database_if_empty(conn)
        if inserted > 0:
            logger.info(f"Seeded {inserted} realistic road hazard records into SQLite.")
        else:
            logger.info("Database already contains hazard records.")
        # Run confirmation engine across all records
        updated_corrob = recalculate_all_corroborations(conn)
        logger.info(f"Confirmation Engine evaluated {updated_corrob} hazard records.")
    finally:
        conn.close()
    # Load pothole detection model once at startup
    model_ok = detector.load_model()
    if model_ok:
        logger.info("Pothole Detection Engine (YOLOv8n-seg ONNX) is READY.")
    else:
        logger.warning(
            "Pothole Detection Engine failed to load. "
            "POST /api/detect-hazard will return model_not_loaded status."
        )
    logger.info("EVEN Road Safety Platform Backend is ONLINE.")
    yield
    logger.info("Shutting down EVEN Platform Backend.")

app = FastAPI(
    title="EVEN — Road Safety & Urban Intelligence API",
    description="Backend microservice for edge hazard ingestion, road memory, and municipal risk analytics.",
    version="1.1.0",
    lifespan=lifespan
)

# CORS configuration allowing laptop browser and mobile phone on local network
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount local uploads directory for evidence photos
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Health check endpoint
@app.get("/api/health", response_model=HealthResponse, tags=["Health"])
def health_check():
    conn = get_db_connection()
    try:
        total = crud.count_hazards(conn)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM hazards WHERE confirmation_status = 'confirmed'")
        corroborated = cursor.fetchone()[0]
    finally:
        conn.close()

    return HealthResponse(
        status="healthy",
        app="EVEN Motorcycle Road Safety Engine",
        version="1.1.0",
        timestamp=datetime.now(timezone.utc).isoformat(),
        database="sqlite3:connected",
        total_hazards=total,
        corroborated_hazards=corroborated
    )

# Include Routers
app.include_router(hazards_router)
app.include_router(analytics_router)
app.include_router(detection_router)
app.include_router(geocoding_router)
app.include_router(weather_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
