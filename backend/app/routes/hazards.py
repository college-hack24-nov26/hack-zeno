from fastapi import APIRouter, HTTPException, Query, status, UploadFile, File
from typing import List, Optional
from pathlib import Path
import logging
import uuid
from backend.app.database import get_db_connection
from backend.app.schemas import (
    HazardResponse,
    HazardCreate,
    HazardUpdate,
    HazardType,
    SeverityLevel,
    ConfirmationStatus,
    PhotoUploadResponse
)
from backend.app import crud
from backend.app.confirmation_engine import recalculate_all_corroborations

logger = logging.getLogger("even.hazards")
router = APIRouter(prefix="/api/hazards", tags=["Hazards"])

BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/upload-photo", response_model=PhotoUploadResponse)
async def upload_hazard_photo(file: UploadFile = File(...)):
    """
    Uploads an optical evidence photo from device camera or gallery.
    Saves locally to backend/uploads and returns a static URL.
    """
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed_extensions:
        ext = ".jpg"

    unique_filename = f"hazard_{uuid.uuid4().hex[:12]}{ext}"
    target_path = UPLOADS_DIR / unique_filename

    try:
        contents = await file.read()
        with open(target_path, "wb") as f:
            f.write(contents)

        image_path = f"/uploads/{unique_filename}"
        logger.info(f"Saved hazard photo: {image_path} ({len(contents)} bytes)")
        return PhotoUploadResponse(
            status="success",
            image_path=image_path,
            filename=unique_filename,
            size_bytes=len(contents)
        )
    except Exception as e:
        logger.error(f"Failed to upload photo: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save uploaded photo: {str(e)}"
        )

@router.post("/recalculate-corroboration")
def trigger_recalculate_corroboration():
    """
    Manually triggers the Road Memory confirmation engine across all records
    to re-evaluate distance/time corroboration clusters.
    """
    conn = get_db_connection()
    try:
        updated = recalculate_all_corroborations(conn)
        return {
            "status": "success",
            "message": f"Confirmation engine evaluated {updated} hazard records.",
            "updated_count": updated
        }
    finally:
        conn.close()

@router.get("", response_model=List[HazardResponse])
def list_hazards(
    hazard_type: Optional[str] = Query(None, description="Filter by hazard type"),
    severity: Optional[str] = Query(None, description="Filter by severity level"),
    confirmation_status: Optional[str] = Query(None, description="Filter by confirmation status"),
    limit: int = Query(200, ge=1, le=500, description="Max hazards to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination")
):
    """Retrieve road hazards with optional filtering by type, severity, and status."""
    conn = get_db_connection()
    try:
        hazards = crud.get_hazards(
            conn=conn,
            hazard_type=hazard_type,
            severity=severity,
            confirmation_status=confirmation_status,
            limit=limit,
            offset=offset
        )
        return hazards
    finally:
        conn.close()

@router.get("/{hazard_id}", response_model=HazardResponse)
def get_hazard(hazard_id: int):
    """Retrieve details for a single road hazard by ID."""
    conn = get_db_connection()
    try:
        hazard = crud.get_hazard_by_id(conn, hazard_id)
        if not hazard:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Hazard #{hazard_id} not found"
            )
        return hazard
    finally:
        conn.close()

@router.post("", response_model=HazardResponse, status_code=status.HTTP_201_CREATED)
def create_hazard(hazard_in: HazardCreate):
    """Report a new road hazard into the EVEN Road Memory system."""
    conn = get_db_connection()
    try:
        created = crud.create_hazard(conn, hazard_in)
        logger.info(f"Registered new hazard #{created['id']} [{created['hazard_type']}] at {created['latitude']},{created['longitude']}")
        return created
    except Exception as e:
        logger.error(f"Failed to record hazard: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create hazard record: {str(e)}"
        )
    finally:
        conn.close()

@router.patch("/{hazard_id}", response_model=HazardResponse)
def update_hazard(hazard_id: int, hazard_update: HazardUpdate):
    """Update hazard details (e.g., mark confirmed, adjust severity, resolve)."""
    conn = get_db_connection()
    try:
        updated = crud.update_hazard(conn, hazard_id, hazard_update)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Hazard #{hazard_id} not found"
            )
        logger.info(f"Updated hazard #{hazard_id}: {hazard_update.model_dump(exclude_unset=True)}")
        return updated
    finally:
        conn.close()

@router.delete("/{hazard_id}", status_code=status.HTTP_200_OK)
def delete_hazard(hazard_id: int):
    """Remove a hazard report from the database."""
    conn = get_db_connection()
    try:
        deleted = crud.delete_hazard(conn, hazard_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Hazard #{hazard_id} not found"
            )
        logger.info(f"Deleted hazard #{hazard_id}")
        return {"status": "success", "message": f"Hazard #{hazard_id} deleted successfully"}
    finally:
        conn.close()
