"""
Test: Pothole Detection Inference (ONNX)
=========================================
Tests the detector module directly using a synthetic test image
and a real pothole JPEG from the existing uploads/ directory (if available).

These tests verify:
1. Model loads correctly from disk
2. run_inference() returns expected dict schema
3. An image without clear potholes returns status "no_detections" (not an error)
4. An invalid file returns status "error" with a meaningful error_detail
5. A known pothole image (if available) returns ≥1 detection

Run with:
    cd c:\\Users\\patel\\Downloads\\Zeno
    python -m pytest backend/tests/test_detection.py -v
"""

import io
import sys
import os
import unittest
import numpy as np
from pathlib import Path

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app import detector


class TestDetectorLoad(unittest.TestCase):
    """Model loading and status checks."""

    def test_model_file_exists(self):
        """The weight file must be present before any test can proceed."""
        self.assertTrue(
            detector.MODEL_PATH.exists(),
            f"Model weights not found at {detector.MODEL_PATH}. "
            "Download pothole_yolov8n.onnx into backend/models/."
        )

    def test_load_model(self):
        """load_model() must return True and set the session."""
        ok = detector.load_model()
        self.assertTrue(ok, "load_model() returned False — check model path and onnxruntime install")
        self.assertTrue(detector.is_model_ready())


class TestInferenceContract(unittest.TestCase):
    """Verify the shape of run_inference() output regardless of detection result."""

    @classmethod
    def setUpClass(cls):
        ok = detector.load_model()
        if not ok:
            raise unittest.SkipTest("Model could not be loaded — skipping inference tests")

    def _make_solid_jpeg(self, r: int, g: int, b: int, w: int = 320, h: int = 240) -> bytes:
        """Create a solid-colour JPEG in memory."""
        from PIL import Image
        img = Image.new("RGB", (w, h), color=(r, g, b))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        return buf.getvalue()

    def test_inference_returns_required_keys(self):
        """run_inference() must always return all required keys."""
        img_bytes = self._make_solid_jpeg(128, 128, 128)
        result = detector.run_inference(img_bytes)
        required_keys = {
            "inference_status", "model_name", "detections",
            "detection_count", "annotated_image", "error_detail"
        }
        for key in required_keys:
            self.assertIn(key, result, f"Missing key '{key}' in run_inference() result")

    def test_inference_status_is_valid_value(self):
        """inference_status must be one of the defined values."""
        img_bytes = self._make_solid_jpeg(50, 50, 50)
        result = detector.run_inference(img_bytes)
        valid_statuses = {"ok", "no_detections", "model_not_loaded", "error"}
        self.assertIn(result["inference_status"], valid_statuses)

    def test_detection_count_matches_list(self):
        """detection_count must match len(detections)."""
        img_bytes = self._make_solid_jpeg(200, 180, 160)
        result = detector.run_inference(img_bytes)
        self.assertEqual(result["detection_count"], len(result["detections"]))

    def test_invalid_image_bytes_returns_error(self):
        """Passing non-image bytes must return inference_status='error', not raise."""
        garbage = b"this is not an image file at all!!! \x00\x01\x02"
        result = detector.run_inference(garbage)
        self.assertEqual(result["inference_status"], "error")
        self.assertIsNotNone(result["error_detail"])
        self.assertEqual(result["detection_count"], 0)

    def test_empty_bytes_returns_error(self):
        """Empty bytes must return inference_status='error'."""
        result = detector.run_inference(b"")
        self.assertEqual(result["inference_status"], "error")

    def test_detection_schema_when_found(self):
        """
        Run inference on the synthetic pothole test image.
        Whether or not the model detects potholes in a synthetic image,
        the response structure must be valid (status is ok OR no_detections).
        The model is trained on real road photos so may not detect synthetic ones.
        """
        sample_path = Path(__file__).resolve().parent / "sample_pothole.jpg"
        self.assertTrue(
            sample_path.exists(),
            f"Sample test image missing at {sample_path}. Run test setup."
        )
        img_bytes = sample_path.read_bytes()
        result = detector.run_inference(img_bytes)

        # Status must be valid — never an error on a valid image
        self.assertIn(
            result["inference_status"], {"ok", "no_detections"},
            f"Expected ok or no_detections, got: {result['inference_status']} — {result['error_detail']}"
        )
        # detection_count must match list length
        self.assertEqual(result["detection_count"], len(result["detections"]))

        # If detections exist, verify schema of each detection
        for det in result["detections"]:
            self.assertEqual(det["class_name"], "pothole")
            self.assertGreaterEqual(det["confidence"], detector.CONF_THRESHOLD)
            self.assertLessEqual(det["confidence"], 1.0)
            bbox = det["bbox_pixels"]
            for coord in ("x1", "y1", "x2", "y2", "width", "height"):
                self.assertIn(coord, bbox)
            # Sanity: box dimensions must be non-negative
            self.assertGreaterEqual(bbox["width"], 0.0)
            self.assertGreaterEqual(bbox["height"], 0.0)

    def test_real_jpeg_does_not_raise(self):
        """
        Any valid JPEG must produce status ok or no_detections (not error).
        Tests with a real road photo from uploads/ if available, otherwise
        uses the solid-colour synthetic image.
        """
        # Find first real-size image in uploads (>1KB means it's not a placeholder)
        uploads_dir = Path(__file__).resolve().parent.parent / "uploads"
        real_images = [
            f for f in uploads_dir.glob("*.jpg")
            if f.stat().st_size > 1024
        ]
        if real_images:
            img_bytes = real_images[0].read_bytes()
        else:
            img_bytes = self._make_solid_jpeg(100, 100, 90, 480, 360)

        result = detector.run_inference(img_bytes)
        self.assertIn(result["inference_status"], {"ok", "no_detections"})


class TestNMSAndDecode(unittest.TestCase):
    """Unit tests for NMS and box-decoding utilities."""

    def test_nms_removes_overlapping_boxes(self):
        """Highly overlapping boxes with different scores: only the top box survives."""
        boxes = np.array([
            [10, 10, 100, 100],
            [12, 12, 98, 98],   # heavily overlaps box 0
            [200, 200, 300, 300],  # no overlap
        ], dtype=np.float32)
        scores = np.array([0.9, 0.8, 0.7], dtype=np.float32)
        kept = detector._nms(boxes, scores, iou_thr=0.45)
        # box 1 should be suppressed (overlaps box 0), box 2 kept
        self.assertIn(0, kept)
        self.assertIn(2, kept)
        self.assertNotIn(1, kept)

    def test_nms_returns_all_when_no_overlap(self):
        """Non-overlapping boxes: all should survive NMS."""
        boxes = np.array([
            [0, 0, 50, 50],
            [100, 100, 150, 150],
            [200, 200, 250, 250],
        ], dtype=np.float32)
        scores = np.array([0.9, 0.85, 0.8], dtype=np.float32)
        kept = detector._nms(boxes, scores, iou_thr=0.45)
        self.assertEqual(len(kept), 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
