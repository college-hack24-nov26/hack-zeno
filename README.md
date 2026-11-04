# EVEN — AI-Powered Motorcycle Road Safety & Urban Intelligence Platform

> **Hackathon Prototype | Phase 1: Build the Foundation**  
> A high-contrast, tactical road-safety mobility system designed for motorcycle cockpits (handlebar phone mounts) and municipal engineering desks.

---

## 🏍️ Project Vision

EVEN empowers two-wheeler riders by recording road hazards (potholes, oil slicks, unmarked speed breakers, loose construction gravel, waterlogging), tracking GPS coordinates, estimating risk severity, and alerting upcoming riders on the same corridor.

### Core Concepts:
- **Edge Perception:** On-device camera and IMU road hazard detection.
- **Road Memory:** Durable local SQLite hazard database with optical evidence frames.
- **Risk Engine:** Multi-rider report confirmation and severity weighting.
- **Rider Warning Channel:** Audio frequency chime and cockpit HUD proximity alerts.
- **Fleet Intelligence:** Decentralized telemetry synchronization.
- **Urban Intelligence:** Municipal maintenance priority queue and chronic hotspot analysis.

---

## 🛠️ Tech Stack & Zero-Cost Architecture

- **Backend:** Python, FastAPI, SQLite3 (`WAL` mode), Pydantic v2, Uvicorn
- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4, React Router v7, Leaflet (OpenStreetMap)
- **Zero Paid APIs / Zero Cloud Subscriptions:**
  - OpenStreetMap & CartoDB Dark Matter tiles (No Google Maps API key required).
  - Browser-native Web Audio API synthesizer for acoustic warnings (No external sound files or streaming).
  - Browser Geolocation API (`navigator.geolocation`) for real-time telemetry.
  - WebRTC (`navigator.mediaDevices.getUserMedia`) for cockpit camera alignment.
  - Local SQLite database (`backend/even.db`) for Road Memory.

---

## 📁 Project Structure

```text
EVEN/
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   │   ├── hazards.py       # CRUD endpoints: GET, POST, PATCH, DELETE
│   │   │   └── analytics.py     # Overview and Urban Intelligence stats
│   │   ├── database.py          # SQLite schema, WAL mode, connections
│   │   ├── schemas.py           # Pydantic models & validation
│   │   ├── crud.py              # Database query logic
│   │   ├── seed.py              # Realistic sample hazards
│   │   └── main.py              # FastAPI application & lifespan
│   ├── tests/
│   │   └── test_api.py          # Automated test suite (CRUD, Health, Analytics)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx            # Telemetry status, GPS lock, quick report
│   │   │   ├── Sidebar.tsx           # Desktop tactical drawer
│   │   │   ├── BottomNav.tsx         # Mobile touch navigation
│   │   │   ├── SeverityBadge.tsx     # Color-coded risk indicators
│   │   │   ├── ConfirmationBadge.tsx # Verification status indicators
│   │   │   ├── CreateHazardModal.tsx # Hazard intake modal with GPS button
│   │   │   └── EvidenceModal.tsx     # Optical frame inspector HUD
│   │   ├── pages/
│   │   │   ├── OverviewPage.tsx      # KPIs, severity breakdown, recent activity
│   │   │   ├── RoadMemoryPage.tsx    # Filterable hazard catalog (Cards & Table)
│   │   │   ├── LiveMapPage.tsx       # Leaflet spatial map with glowing markers
│   │   │   ├── RiderSafetyPage.tsx   # Cockpit HUD, camera preview, audio chimes
│   │   │   └── UrbanIntelligencePage.tsx # Municipal priority queue & CSV export
│   │   ├── services/
│   │   │   └── api.ts                # Typed fetch client
│   │   ├── types/
│   │   │   └── hazard.ts             # TypeScript interfaces
│   │   ├── App.tsx                   # Routing & global modals
│   │   ├── main.tsx
│   │   └── index.css                 # Dark theme & pulse animations
│   ├── package.json
│   └── vite.config.ts                # Dev server host: 0.0.0.0 & API proxy
├── .gitignore
└── README.md
```

---

## 🚀 Exact Commands to Run

### 1. Start the Backend API (FastAPI)
From the root workspace directory:
```bash
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
- API Health Check: `http://localhost:8000/api/health`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`

### 2. Start the Frontend (Vite + React)
In a separate terminal:
```bash
cd frontend
npm run dev
```
- Open on laptop: `http://localhost:5173`
- Open on Android phone (same WiFi): `http://<YOUR_LAPTOP_IP>:5173`

### 3. Run Backend Automated Test Suite
From the root workspace directory:
```bash
python -m unittest backend/tests/test_api.py
```

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health, SQLite connection, hazard count |
| `GET` | `/api/hazards` | List hazards (filters: `hazard_type`, `severity`, `confirmation_status`, `limit`) |
| `GET` | `/api/hazards/{id}` | Retrieve single hazard details |
| `POST` | `/api/hazards` | Record a new road hazard into Road Memory |
| `PATCH` | `/api/hazards/{id}` | Partial update (status, severity, description) |
| `DELETE` | `/api/hazards/{id}` | Delete hazard record |
| `GET` | `/api/analytics/overview` | KPI summaries and severity distributions |
| `GET` | `/api/analytics/urban-intelligence` | Maintenance priority queue and sector metrics |

---

## 📱 Mobile & Laptop Ergonomics

- **Mobile Android Browser:** Sticky bottom navigation bar, touch-friendly tap targets, camera viewfinder for handlebar mount, and instant GPS geolocation.
- **Laptop / Municipal Desktop:** Tactical side navigation, multi-column metrics, detailed tabular views, and CSV export for public works repair crews.
