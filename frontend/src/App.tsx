import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { CreateHazardModal } from './components/CreateHazardModal';
import { EvidenceModal } from './components/EvidenceModal';
import { OverviewPage } from './pages/OverviewPage';
import { RoadMemoryPage } from './pages/RoadMemoryPage';
import { LiveMapPage } from './pages/LiveMapPage';
import { RiderSafetyPage } from './pages/RiderSafetyPage';
import { UrbanIntelligencePage } from './pages/UrbanIntelligencePage';
import { LiveCameraDetectorPage } from './pages/LiveCameraDetectorPage';
import type { Hazard, HazardCreate, ConfirmationStatus } from './types/hazard';
import { createHazard, updateHazard, deleteHazard } from './services/api';

export const App: React.FC = () => {
  const [reportModalOpen, setReportModalOpen] = useState<boolean>(false);
  const [inspectedHazard, setInspectedHazard] = useState<Hazard | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const handleCreateHazard = async (data: HazardCreate) => {
    await createHazard(data);
    // Smoothly re-fetch by updating key
    setRefreshKey((k) => k + 1);
  };

  const handleUpdateStatus = async (id: number, status: ConfirmationStatus) => {
    const updated = await updateHazard(id, { confirmation_status: status });
    setInspectedHazard(updated);
    setRefreshKey((k) => k + 1);
  };

  const handleDeleteHazard = async (id: number) => {
    await deleteHazard(id);
    setInspectedHazard(null);
    setRefreshKey((k) => k + 1);
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans selection:bg-teal-600 selection:text-white">
        {/* Top Navbar */}
        <Navbar onOpenReportModal={() => setReportModalOpen(true)} />

        {/* Main Content Layout with Sidebar */}
        <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
          <Sidebar />

          <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 lg:pb-8 overflow-y-auto">
            <Routes>
              <Route
                path="/"
                element={
                  <OverviewPage
                    key={`overview-${refreshKey}`}
                    onOpenReportModal={() => setReportModalOpen(true)}
                    onInspectHazard={(h) => setInspectedHazard(h)}
                  />
                }
              />
              <Route
                path="/memory"
                element={
                  <RoadMemoryPage
                    key={`memory-${refreshKey}`}
                    onOpenReportModal={() => setReportModalOpen(true)}
                    onInspectHazard={(h) => setInspectedHazard(h)}
                  />
                }
              />
              <Route
                path="/map"
                element={
                  <LiveMapPage
                    key={`map-${refreshKey}`}
                    onInspectHazard={(h) => setInspectedHazard(h)}
                  />
                }
              />
              <Route
                path="/live-camera"
                element={<LiveCameraDetectorPage key={`live-cam-${refreshKey}`} />}
              />
              <Route
                path="/video-analyzer"
                element={<Navigate to="/live-camera" replace />}
              />
              <Route
                path="/safety"
                element={<RiderSafetyPage key={`safety-${refreshKey}`} />}
              />
              <Route
                path="/intelligence"
                element={<UrbanIntelligencePage key={`intel-${refreshKey}`} />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>

        {/* Mobile Bottom Navigation */}
        <BottomNav />

        {/* Global Modals */}
        <CreateHazardModal
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          onSubmit={handleCreateHazard}
        />

        <EvidenceModal
          hazard={inspectedHazard}
          isOpen={!!inspectedHazard}
          onClose={() => setInspectedHazard(null)}
          onUpdateStatus={handleUpdateStatus}
          onDelete={handleDeleteHazard}
        />
      </div>
    </BrowserRouter>
  );
};

export default App;
