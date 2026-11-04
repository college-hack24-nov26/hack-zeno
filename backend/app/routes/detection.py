"""
POST /api/detect-hazard
=======================
Accepts an image upload, runs local ONNX pothole inference, and returns
genuine model output: detected class, confidence, bounding boxes, and an
annotated image encoded as base64 JPEG.

This endpoint does NOT auto-set hazard severity.
Detection confidence is model output and must remain separate from
the rider-selected severity field in the hazard report form.
"""

import base64
import logging
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from typing import Optional

from backend.app import detector

logger = logging.getLogger("even.detect")

router = APIRouter(prefix="/api", tags=["Pothole Detection (ONNX)"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024   # 10 MB hard limit
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------
class BBoxPixels(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    width: float
    height: float


class Detection(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    bbox_pixels: BBoxPixels


class DetectHazardResponse(BaseModel):
    inference_status: str          # "ok" | "no_detections" | "model_not_loaded" | "error"
    model_name: str
    model_source: Optional[str] = None
    model_license: Optional[str] = None
    architecture: Optional[str] = None
    detection_count: int
    detections: list[Detection]
    annotated_image_b64: Optional[str] = None   # base64-encoded JPEG with drawn bboxes
    error_detail: Optional[str] = None
    disclaimer: str = (
        "Detection confidence is raw model output. "
        "It does not automatically set hazard severity. "
        "Hazard severity must be assessed and confirmed by the reporting rider."
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/detect-hazard", response_model=DetectHazardResponse)
async def detect_hazard(file: UploadFile = File(...)):
    """
    Upload a road photo to run local YOLOv8n pothole detection inference.

    - Returns bounding boxes, class name (always 'pothole'), and confidence scores.
    - Returns a base64-encoded annotated JPEG with drawn bounding boxes.
    - If no potholes are detected the response contains an empty detections list.
    - Detection confidence is kept separate from the hazard report severity field.
    """
    # --- Content-type guard ---
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{content_type}'. Use JPEG, PNG, or WebP."
        )

    # --- Read with size limit ---
    image_bytes = await file.read()
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image exceeds 10 MB limit ({len(image_bytes) // 1024} KB received)."
        )
    if len(image_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file received."
        )

    logger.info(f"[Detect] Received image: {file.filename!r}  {len(image_bytes)} bytes  ct={content_type}")

    # --- Run inference ---
    result = detector.run_inference(image_bytes)

    # --- Encode annotated image ---
    annotated_b64: Optional[str] = None
    if result.get("annotated_image"):
        annotated_b64 = base64.b64encode(result["annotated_image"]).decode("ascii")

    # --- Build detections list ---
    dets = []
    for d in result.get("detections", []):
        dets.append(Detection(
            class_id=d["class_id"],
            class_name=d["class_name"],
            confidence=d["confidence"],
            bbox_pixels=BBoxPixels(**d["bbox_pixels"])
        ))

    return DetectHazardResponse(
        inference_status=result["inference_status"],
        model_name=result["model_name"],
        model_source=result.get("model_source"),
        model_license=result.get("model_license"),
        architecture=result.get("architecture"),
        detection_count=result["detection_count"],
        detections=dets,
        annotated_image_b64=annotated_b64,
        error_detail=result.get("error_detail"),
    )


@router.get("/detect-hazard/status")
def detector_status():
    """Returns the current load state of the pothole detection model."""
    return {
        "model_loaded": detector.is_model_ready(),
        "model_file": "backend/models/pothole_yolov8n.onnx",
        "model_source": "https://huggingface.co/subhodeepmoitra/pothole-detection-yolov8",
        "architecture": "YOLOv8n-seg",
        "classes": {"0": "pothole"},
        "license": "AGPL-3.0",
        "conf_threshold": detector.CONF_THRESHOLD,
        "iou_threshold": detector.IOU_THRESHOLD,
    }
