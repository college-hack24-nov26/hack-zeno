"""
EVEN Pothole Detector
=====================
Local ONNX inference using a pretrained YOLOv8n-seg model fine-tuned
specifically on road pothole imagery.

Model source  : https://huggingface.co/subhodeepmoitra/pothole-detection-yolov8
Architecture  : YOLOv8n-seg (Ultralytics 8.3.213, PyTorch → ONNX export)
Classes       : {0: 'pothole'}  (single-class detector)
License       : AGPL-3.0  (https://ultralytics.com/license)
Input         : RGB float32 tensor [1, 3, 640, 640], values in [0, 1]
Output0       : [1, 37, 8400]  — 4 bbox + 1 objectness + 32 mask coefficients
Output1       : [1, 32, 160, 160] — prototype masks (not used for bbox detection)

NOTE: We use the bounding-box head only.  We do NOT generate segmentation masks
in the API response because they require significant post-processing and are
not needed for the Road Hazard Report UI.  Mask generation can be added later.

This module is intentionally free of Ultralytics/PyTorch runtime dependencies.
It requires only: onnxruntime, numpy, Pillow — all already installed.
"""

import io
import logging
import math
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageDraw, UnidentifiedImageError

try:
    import onnxruntime as ort
    _ORT_AVAILABLE = True
except ImportError:
    _ORT_AVAILABLE = False

logger = logging.getLogger("even.detector")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "pothole_yolov8n.onnx"
CLASS_NAMES = {0: "pothole"}
INPUT_SIZE = 640          # model expects 640×640
CONF_THRESHOLD = 0.50     # minimum objectness × class-score to keep a detection
                          # (raised from 0.25 — eliminates ambiguous borderline hits)
IOU_THRESHOLD = 0.45      # NMS IoU overlap threshold
MAX_DETECTIONS = 20       # cap per image


# ---------------------------------------------------------------------------
# Singleton model loader — called once at application startup
# ---------------------------------------------------------------------------
_session: Optional["ort.InferenceSession"] = None


def load_model() -> bool:
    """
    Load the ONNX model into an onnxruntime InferenceSession.
    Returns True on success, False if weights are missing or loading fails.
    Called once in FastAPI lifespan startup.
    """
    global _session

    if not _ORT_AVAILABLE:
        logger.error("onnxruntime is not installed. Run: pip install onnxruntime")
        return False

    if not MODEL_PATH.exists():
        logger.error(
            f"Model weights not found at {MODEL_PATH}. "
            "Download pothole_yolov8n.onnx and place it in backend/models/."
        )
        return False

    try:
        _session = ort.InferenceSession(
            str(MODEL_PATH),
            providers=["CPUExecutionProvider"]
        )
        meta = _session.get_modelmeta().custom_metadata_map
        logger.info(
            f"[Detector] Model loaded — "
            f"arch={meta.get('description', 'YOLOv8n-seg')}, "
            f"classes={meta.get('names', CLASS_NAMES)}, "
            f"trained={meta.get('date', 'unknown')}"
        )
        return True
    except Exception as exc:
        logger.error(f"[Detector] Failed to load ONNX model: {exc}")
        _session = None
        return False


def is_model_ready() -> bool:
    return _session is not None


# ---------------------------------------------------------------------------
# Image preprocessing
# ---------------------------------------------------------------------------
def _preprocess(image_bytes: bytes) -> tuple[np.ndarray, tuple[int, int], tuple[float, float]]:
    """
    Load image bytes, letterbox-resize to 640×640, normalise to [0,1].

    Returns:
        input_tensor  : float32 [1, 3, 640, 640]
        original_size : (orig_w, orig_h)
        scale         : (scale_x, scale_y) used to map boxes back to original coords
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    orig_w, orig_h = img.size

    # Letterbox: scale keeping aspect ratio, pad to 640×640 with grey
    scale = min(INPUT_SIZE / orig_w, INPUT_SIZE / orig_h)
    new_w = int(round(orig_w * scale))
    new_h = int(round(orig_h * scale))
    resized = img.resize((new_w, new_h), Image.BILINEAR)

    canvas = Image.new("RGB", (INPUT_SIZE, INPUT_SIZE), (114, 114, 114))
    pad_x = (INPUT_SIZE - new_w) // 2
    pad_y = (INPUT_SIZE - new_h) // 2
    canvas.paste(resized, (pad_x, pad_y))

    arr = np.array(canvas, dtype=np.float32) / 255.0          # [H, W, 3]
    arr = arr.transpose(2, 0, 1)[np.newaxis, ...]              # [1, 3, H, W]

    return arr, (orig_w, orig_h), (pad_x, pad_y, scale)


# ---------------------------------------------------------------------------
# Bounding-box decoding
# ---------------------------------------------------------------------------
def _decode_output(raw: np.ndarray) -> list[dict]:
    """
    Decode raw YOLOv8 output [1, 37, 8400] into a list of boxes.

    YOLOv8 output layout per anchor (across 8400 candidates):
      [cx, cy, w, h,  obj_score,  ...32 mask coefficients...]
    For a single-class model, objectness IS the class score.
    """
    preds = raw[0]               # [37, 8400]
    boxes_xyxy = []
    confidences = []

    cx = preds[0]
    cy = preds[1]
    w  = preds[2]
    h  = preds[3]
    scores = preds[4]            # objectness (= class0 prob for single-class model)

    keep = scores >= CONF_THRESHOLD
    if not keep.any():
        return []

    cx = cx[keep]; cy = cy[keep]; w = w[keep]; h = h[keep]; scores = scores[keep]

    x1 = cx - w / 2
    y1 = cy - h / 2
    x2 = cx + w / 2
    y2 = cy + h / 2

    boxes_xyxy = np.stack([x1, y1, x2, y2], axis=1)   # [N, 4]
    confidences = scores                                  # [N]

    # Apply NMS
    indices = _nms(boxes_xyxy, confidences, IOU_THRESHOLD)
    results = []
    for idx in indices[:MAX_DETECTIONS]:
        results.append({
            "class_id": 0,
            "class_name": "pothole",
            "confidence": float(confidences[idx]),
            "bbox_640": [
                float(boxes_xyxy[idx, 0]),
                float(boxes_xyxy[idx, 1]),
                float(boxes_xyxy[idx, 2]),
                float(boxes_xyxy[idx, 3]),
            ]
        })
    return results


def _nms(boxes: np.ndarray, scores: np.ndarray, iou_thr: float) -> list[int]:
    """Pure-numpy greedy NMS. Returns kept indices sorted by descending score."""
    order = scores.argsort()[::-1]
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1).clip(0) * (y2 - y1).clip(0)
    kept = []
    suppressed = set()
    for i in order:
        if i in suppressed:
            continue
        kept.append(int(i))
        ix1 = np.maximum(x1[i], x1)
        iy1 = np.maximum(y1[i], y1)
        ix2 = np.minimum(x2[i], x2)
        iy2 = np.minimum(y2[i], y2)
        inter = (ix2 - ix1).clip(0) * (iy2 - iy1).clip(0)
        iou = inter / (areas[i] + areas - inter + 1e-7)
        for j, iou_val in enumerate(iou):
            if j != i and iou_val > iou_thr:
                suppressed.add(j)
    return kept


# ---------------------------------------------------------------------------
# False-Positive Validation Guard
# ---------------------------------------------------------------------------
# Multi-factor validation to reject non-road false positives (faces, eyes, indoor objects).
# Three independent checks — a detection is rejected if ANY check fails:
#   1. Skin-tone chromaticity (YCbCr) — rejects human skin regions
#   2. Minimum absolute size — eye sockets and small features are far too small
#   3. Asphalt darkness check — real potholes are dark; skin/faces are much brighter

def _is_false_positive(
    arr_rgb: np.ndarray,
    arr_ycrcb: np.ndarray,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    orig_w: int,
    orig_h: int,
) -> bool:
    """
    Return True if the bounding box region is likely a false positive (not a real pothole).

    Checks applied (ANY match → reject):
      A) Skin-tone chromaticity: Cb in [77,127] & Cr in [133,173] — lowered threshold to 15%
         to catch compressed/dark webcam skin tones.
      B) Minimum size: bbox must be at least 60×40 px on the original image, AND cover
         at least 1% of frame area.  Facial eye sockets are ~30×25 px.
      C) Luminance: mean Y of detection region must be < 160 on a 0-255 scale.
         Skin has mean Y ~180-220; asphalt/potholes have mean Y ~30-100.
      D) Saturation proxy: dark, desaturated regions (asphalt) have |Cb-128| + |Cr-128| < 30.
         Skin has much higher chrominance deviation.  If deviation > 25 → likely not asphalt.
    """
    try:
        box_w = x2 - x1
        box_h = y2 - y1

        # --- Check B: Minimum absolute size ---
        # Real potholes detectable by a road camera are substantial objects.
        # Minimum 80×50 pixels on the original frame, AND at least 0.8% of frame area.
        if box_w < 80 or box_h < 50:
            logger.info(
                f"[Detector] Rejected — bbox too small: {box_w:.0f}×{box_h:.0f} px "
                f"(min 80×50 required for genuine pothole)"
            )
            return True

        frame_area = orig_w * orig_h
        box_area = box_w * box_h
        if box_area / frame_area < 0.008:
            logger.info(
                f"[Detector] Rejected — bbox area {box_area:.0f} px² "
                f"= {100*box_area/frame_area:.2f}% of frame (min 0.8%)"
            )
            return True

        # Clamp crop to image bounds
        ix1 = max(0, int(round(x1)))
        iy1 = max(0, int(round(y1)))
        ix2 = min(orig_w, int(round(x2)))
        iy2 = min(orig_h, int(round(y2)))
        if ix2 <= ix1 or iy2 <= iy1:
            return False  # degenerate crop; skip further checks

        crop_rgb = arr_rgb[iy1:iy2, ix1:ix2]       # [H, W, 3]
        crop_ycbcr = arr_ycrcb[iy1:iy2, ix1:ix2]   # [H, W, 3]

        y_ch  = crop_ycbcr[..., 0].astype(np.float32)
        cb_ch = crop_ycbcr[..., 1].astype(np.float32)
        cr_ch = crop_ycbcr[..., 2].astype(np.float32)

        # --- Check A: Skin-tone chromaticity (sensitive threshold) ---
        # Cb in [77,127] AND Cr in [133,173] = standard skin range.
        # Threshold lowered to 15% (from 35%) to catch compressed webcam frames.
        skin_pixels = (cb_ch >= 77) & (cb_ch <= 127) & (cr_ch >= 133) & (cr_ch <= 173)
        skin_ratio = float(np.mean(skin_pixels))
        if skin_ratio > 0.15:
            logger.info(
                f"[Detector] Rejected — skin chromaticity ratio {skin_ratio:.1%} > 15%"
            )
            return True

        # --- Check C: Luminance — pothole regions are dark ---
        # Asphalt/potholes: mean Y ≈ 30-110; skin/faces: mean Y ≈ 160-230.
        mean_y = float(np.mean(y_ch))
        if mean_y > 140:
            logger.info(
                f"[Detector] Rejected — region too bright: mean Y={mean_y:.1f} "
                f"(potholes are dark, max allowed 140)"
            )
            return True

        # --- Check D: Chrominance deviation — asphalt is nearly neutral grey ---
        # Neutral grey: Cb≈128, Cr≈128.  High deviation → colourful (skin, objects).
        mean_chroma_dev = float(np.mean(np.abs(cb_ch - 128) + np.abs(cr_ch - 128)))
        if mean_chroma_dev > 20:
            logger.info(
                f"[Detector] Rejected — high chrominance deviation {mean_chroma_dev:.1f} "
                f"(asphalt is near-neutral grey, max allowed 20)"
            )
            return True

        return False  # Passed all checks — likely a real pothole

    except Exception as exc:
        logger.warning(f"[Detector] False-positive validation error: {exc}")
        return False  # On error, allow detection through


def _remap_boxes(detections: list[dict], pad_x: int, pad_y: int, scale: float,
                 orig_w: int, orig_h: int, image_bytes: Optional[bytes] = None) -> list[dict]:
    """
    Convert bounding boxes from 640×640 padded space back to original pixel coords.
    Applies multi-factor false-positive rejection (size, luminance, skin tone, chrominance).
    """
    arr_rgb = None
    arr_ycrcb = None
    if image_bytes:
        try:
            pil_rgb = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            arr_rgb = np.array(pil_rgb)
            pil_ycbcr = pil_rgb.convert("YCbCr")
            arr_ycrcb = np.array(pil_ycbcr)
        except Exception:
            arr_rgb = None
            arr_ycrcb = None

    remapped = []
    for det in detections:
        x1, y1, x2, y2 = det["bbox_640"]
        # Remove letterbox padding and reverse scale
        x1 = max(0.0, (x1 - pad_x) / scale)
        y1 = max(0.0, (y1 - pad_y) / scale)
        x2 = min(float(orig_w), (x2 - pad_x) / scale)
        y2 = min(float(orig_h), (y2 - pad_y) / scale)
        x2 = max(x1, x2)
        y2 = max(y1, y2)

        # Multi-factor false-positive guard
        if arr_rgb is not None and arr_ycrcb is not None:
            if _is_false_positive(arr_rgb, arr_ycrcb, x1, y1, x2, y2, orig_w, orig_h):
                continue

        remapped.append({
            "class_id": det["class_id"],
            "class_name": det["class_name"],
            "confidence": round(det["confidence"], 4),
            "bbox_pixels": {
                "x1": round(x1, 1),
                "y1": round(y1, 1),
                "x2": round(x2, 1),
                "y2": round(y2, 1),
                "width": round(x2 - x1, 1),
                "height": round(y2 - y1, 1),
            }
        })
    return remapped


# ---------------------------------------------------------------------------
# Annotated image generation
# ---------------------------------------------------------------------------
def _draw_boxes(image_bytes: bytes, detections: list[dict],
                pad_x: int, pad_y: int, scale: float,
                orig_w: int, orig_h: int) -> bytes:
    """
    Draw bounding boxes and confidence scores on the original image.
    Returns JPEG bytes of the annotated image.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    draw = ImageDraw.Draw(img)

    for det in detections:
        x1, y1, x2, y2 = det["bbox_640"]
        # Remap to pixel coords
        rx1 = max(0.0, (x1 - pad_x) / scale)
        ry1 = max(0.0, (y1 - pad_y) / scale)
        rx2 = min(float(orig_w), (x2 - pad_x) / scale)
        ry2 = min(float(orig_h), (y2 - pad_y) / scale)
        rx2 = max(rx1, rx2)
        ry2 = max(ry1, ry2)

        conf = det["confidence"]
        label = f"pothole {conf:.0%}"

        # Draw box (red outline, thickness 3)
        for t in range(3):
            draw.rectangle([rx1 - t, ry1 - t, rx2 + t, ry2 + t], outline=(239, 68, 68))

        # Label background
        text_w = len(label) * 7
        text_h = 16
        draw.rectangle([rx1, ry1 - text_h - 2, rx1 + text_w, ry1], fill=(239, 68, 68))
        draw.text((rx1 + 2, ry1 - text_h), label, fill=(255, 255, 255))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def run_inference(image_bytes: bytes) -> dict:
    """
    Run pothole detection on raw image bytes.

    Returns a dict with:
      inference_status  : "ok" | "no_detections" | "model_not_loaded" | "error"
      model_name        : str
      detections        : list of {class_name, confidence, bbox_pixels}
      detection_count   : int
      annotated_image   : JPEG bytes of the annotated image (or None)
      error_detail      : str (only on error)
    """
    if not is_model_ready():
        return {
            "inference_status": "model_not_loaded",
            "model_name": "pothole_yolov8n.onnx",
            "detections": [],
            "detection_count": 0,
            "annotated_image": None,
            "error_detail": (
                "Model weights not loaded. Ensure pothole_yolov8n.onnx exists "
                "in backend/models/ and the server started successfully."
            )
        }

    try:
        tensor, (orig_w, orig_h), (pad_x, pad_y, scale) = _preprocess(image_bytes)
    except UnidentifiedImageError:
        return {
            "inference_status": "error",
            "model_name": "pothole_yolov8n.onnx",
            "detections": [],
            "detection_count": 0,
            "annotated_image": None,
            "error_detail": "Uploaded file is not a valid image (JPEG, PNG, or WebP required)."
        }
    except Exception as exc:
        return {
            "inference_status": "error",
            "model_name": "pothole_yolov8n.onnx",
            "detections": [],
            "detection_count": 0,
            "annotated_image": None,
            "error_detail": f"Image preprocessing failed: {exc}"
        }

    try:
        raw_outputs = _session.run(None, {"images": tensor})
    except Exception as exc:
        return {
            "inference_status": "error",
            "model_name": "pothole_yolov8n.onnx",
            "detections": [],
            "detection_count": 0,
            "annotated_image": None,
            "error_detail": f"ONNX inference failed: {exc}"
        }

    raw_dets = _decode_output(raw_outputs[0])
    detections = _remap_boxes(raw_dets, pad_x, pad_y, scale, orig_w, orig_h, image_bytes)

    # Filter raw_dets to only those that passed validation for drawing
    valid_dets = [d for d in detections]
    valid_raw_indices = []
    for i, rd in enumerate(raw_dets):
        rx1 = max(0.0, (rd["bbox_640"][0] - pad_x) / scale)
        ry1 = max(0.0, (rd["bbox_640"][1] - pad_y) / scale)
        rx2 = min(float(orig_w), (rd["bbox_640"][2] - pad_x) / scale)
        ry2 = min(float(orig_h), (rd["bbox_640"][3] - pad_y) / scale)
        # Check if this detection survived in valid_dets
        if any(abs(vd["bbox_pixels"]["x1"] - round(rx1, 1)) < 2.0 and abs(vd["bbox_pixels"]["y1"] - round(ry1, 1)) < 2.0 for vd in valid_dets):
            valid_raw_indices.append(rd)

    annotated = None
    if detections:
        try:
            annotated = _draw_boxes(image_bytes, valid_raw_indices, pad_x, pad_y, scale, orig_w, orig_h)
        except Exception as exc:
            logger.warning(f"[Detector] Failed to draw annotations: {exc}")

    status = "ok" if detections else "no_detections"
    logger.info(
        f"[Detector] Inference complete — status={status}, "
        f"detections={len(detections)}, "
        f"top_conf={detections[0]['confidence'] if detections else 'n/a'}"
    )

    return {
        "inference_status": status,
        "model_name": "pothole_yolov8n.onnx",
        "model_source": "https://huggingface.co/subhodeepmoitra/pothole-detection-yolov8",
        "model_license": "AGPL-3.0",
        "architecture": "YOLOv8n-seg (single-class: pothole)",
        "detections": detections,
        "detection_count": len(detections),
        "annotated_image": annotated,   # raw JPEG bytes — route encodes to base64
        "error_detail": None
    }
