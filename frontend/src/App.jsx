import { Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { RoomPage } from './pages/RoomPage';

function App() {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-cyan-500/30 font-sans">
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/room/:code" element={<RoomPage />} />
                {/* BUG-12: catch-all — invalid URLs redirect to home */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    );
}

export default App;
