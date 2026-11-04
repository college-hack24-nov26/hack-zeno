import unittest
import io
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import init_db

class EvenApiTestSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_health_check(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("total_hazards", data)
        self.assertIn("corroborated_hazards", data)

    def test_list_hazards(self):
        response = self.client.get("/api/hazards")
        self.assertEqual(response.status_code, 200)
        hazards = response.json()
        self.assertIsInstance(hazards, list)
        self.assertGreater(len(hazards), 0)

    def test_filter_hazards(self):
        response = self.client.get("/api/hazards?hazard_type=pothole")
        self.assertEqual(response.status_code, 200)
        for h in response.json():
            self.assertEqual(h["hazard_type"], "pothole")

    def test_corroboration_engine_proximity_detection(self):
        # 1. Report first obstacle
        base_lat, base_lng = 18.6000, 73.9000
        p1 = {
            "hazard_type": "obstacle",
            "severity": "critical",
            "latitude": base_lat,
            "longitude": base_lng,
            "description": "Fallen construction pipe across roadway.",
            "source": "rider_manual"
        }
        res1 = self.client.post("/api/hazards", json=p1)
        self.assertEqual(res1.status_code, 201)
        h1 = res1.json()
        hid1 = h1["id"]

        # 2. Report second compatible obstacle 35m away
        # 0.0003 deg latitude is ~33.3 meters
        p2 = {
            "hazard_type": "obstacle",
            "severity": "high",
            "latitude": base_lat + 0.0003,
            "longitude": base_lng,
            "description": "Second rider confirming construction pipe obstacle.",
            "source": "rider_manual"
        }
        res2 = self.client.post("/api/hazards", json=p2)
        self.assertEqual(res2.status_code, 201)
        h2 = res2.json()
        hid2 = h2["id"]

        # Both hazards should now be corroborated!
        self.assertEqual(h2["confirmation_status"], "confirmed")
        self.assertGreaterEqual(h2["corroboration_count"], 1)
        self.assertIn("Corroborated by", h2["status_reason"])

        # Check that h1 was automatically re-evaluated to corroborated
        check_h1 = self.client.get(f"/api/hazards/{hid1}").json()
        self.assertEqual(check_h1["confirmation_status"], "confirmed")
        self.assertGreaterEqual(check_h1["corroboration_count"], 1)

        # Cleanup test records
        self.client.delete(f"/api/hazards/{hid1}")
        self.client.delete(f"/api/hazards/{hid2}")

    def test_photo_upload_endpoint(self):
        fake_image = io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"fake test image bytes")
        response = self.client.post(
            "/api/hazards/upload-photo",
            files={"file": ("pothole_evidence.jpg", fake_image, "image/jpeg")}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertTrue(data["image_path"].startswith("/uploads/"))

    def test_urban_intelligence_real_insights(self):
        res = self.client.get("/api/analytics/urban-intelligence")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("priority_maintenance_queue", data)
        self.assertIn("real_spatial_clusters", data)
        self.assertIn("report_trends", data)
        self.assertIn("type_distribution", data)
        self.assertIn("severity_distribution", data)

    def test_crud_lifecycle(self):
        payload = {
            "hazard_type": "roadblock",
            "severity": "critical",
            "latitude": 18.5300,
            "longitude": 73.8500,
            "description": "Full road closure due to emergency water main excavation.",
            "source": "rider_manual"
        }
        create_res = self.client.post("/api/hazards", json=payload)
        self.assertEqual(create_res.status_code, 201)
        created = create_res.json()
        created_id = created["id"]

        update_res = self.client.patch(f"/api/hazards/{created_id}", json={
            "confirmation_status": "resolved",
            "description": "Repairs complete, road reopened."
        })
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["confirmation_status"], "resolved")

        del_res = self.client.delete(f"/api/hazards/{created_id}")
        self.assertEqual(del_res.status_code, 200)

if __name__ == "__main__":
    unittest.main()
