import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { PWAUpdater } from '@/components/PWAUpdater';
import { ExerciseProvider } from '@/context/ExerciseContext';
import { isSupabaseConfigured } from '@/lib/supabase';

import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import ForgotPassword from '@/pages/auth/ForgotPassword';
import ResetPassword from '@/pages/auth/ResetPassword';
import Dashboard from '@/pages/Dashboard';
import Track from '@/pages/Track';
import Friends from '@/pages/Friends';
import Leaderboard from '@/pages/Leaderboard';
import Profile from '@/pages/Profile';
import Settings from '@/pages/Settings';
import Privacy from '@/pages/Privacy';
import Imprint from '@/pages/Imprint';
import NotFound from '@/pages/NotFound';

function ConfigNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-md text-center">
        <div className="mb-2 text-4xl">⚙️</div>
        <h1 className="text-xl font-bold">Supabase ist nicht konfiguriert</h1>
        <p className="mt-2 text-sm text-slate-400">
          Lege eine <code className="rounded bg-ink-900 px-1">.env</code> nach dem Muster von{' '}
          <code className="rounded bg-ink-900 px-1">.env.example</code> an und setze{' '}
          <code className="rounded bg-ink-900 px-1">VITE_SUPABASE_URL</code> sowie{' '}
          <code className="rounded bg-ink-900 px-1">VITE_SUPABASE_ANON_KEY</code>. Danach den
          Dev-Server neu starten.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigNotice />;

  return (
    <>
      <PWAUpdater />
      <Routes>
      {/* Öffentliche Routen */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/imprint" element={<Imprint />} />

      {/* Alias: /dashboard -> / */}
      <Route path="/dashboard" element={<Navigate to="/" replace />} />

      {/* Geschützte Routen */}
      <Route
        element={
          <ProtectedRoute>
            <ExerciseProvider>
              <AppLayout />
            </ExerciseProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="track" element={<Track />} />
        <Route path="friends" element={<Friends />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
