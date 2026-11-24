import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SearchPage } from './pages/SearchPage';
import { LoginPage } from './pages/LoginPage';
import { useAuthStore } from './store/authStore';
import { Modal } from './components/Modal';
import { Impressum } from './pages/Impressum';
import { CampDetailPage } from './pages/CampDetailPage';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { ContactPage } from './pages/ContactPage';
import { DatenschutzPage } from './pages/DatenschutzPage';
import './index.css';
import './portal.css';
import { MotionConfig } from 'framer-motion';
import { AccessibilityPage } from './pages/AccessibilityPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProviderRegistrationPage, ProviderVerificationPage } from './pages/ProviderRegistrationPage';
import { ProviderProfilePage } from './pages/ProviderProfilePage';
import { BookingPage, BookingStatusPage } from './pages/BookingPage';
import { BookingManagementPage } from './pages/BookingManagementPage';
import { PortalAdminPage } from './pages/PortalAdminPage';

const ClubDashboard = lazy(() => import('./pages/ClubDashboard').then((m) => ({ default: m.ClubDashboard })));
const ClubCampDetailPage = lazy(() => import('./pages/ClubCampDetailPage').then((m) => ({ default: m.ClubCampDetailPage })));
const ClubCampEditorPage = lazy(() => import('./pages/ClubCampEditorPage').then((m) => ({ default: m.ClubCampEditorPage })));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminClubsPage = lazy(() => import('./pages/AdminClubsPage').then((m) => ({ default: m.AdminClubsPage })));
const AdminCampsPage = lazy(() => import('./pages/AdminCampsPage').then((m) => ({ default: m.AdminCampsPage })));
const AdminCampEditorPage = lazy(() => import('./pages/AdminCampsPage').then((m) => ({ default: m.AdminCampEditorPage })));
const AdminHolidaysPage = lazy(() => import('./pages/AdminHolidaysPage').then((m) => ({ default: m.AdminHolidaysPage })));
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage').then((m) => ({ default: m.AdminReportsPage })));

function ApprovedProviderRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(state => state.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'user' && user.provider_status !== 'approved') return <Navigate to="/traegerprofil" replace />;
  return children;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(state => state.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'user') return <Navigate to="/dashboard" replace />;
  return children;
}

export const App: React.FC = () => {
  const { initialized, initialize, user, error } = useAuthStore();
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    void initialize();
    const onExpiry = () => setExpired(true);
    window.addEventListener('session-expired', onExpiry);
    return () => window.removeEventListener('session-expired', onExpiry);
  }, [initialize]);
  if (!initialized) return <main id="main-content"><h1>Ferienfreizeiten Westsachsen</h1><p role="status">Portal wird geladen …</p></main>;
  return (
    <MotionConfig reducedMotion="user"><BrowserRouter>
      {error && <p className="alert" role="alert">{error} <button onClick={() => void initialize()}>Erneut versuchen</button></p>}
      {expired && <Modal title="Bitte erneut anmelden" onClose={() => setExpired(false)}>
        <p>Deine Anmeldung ist abgelaufen. Melde dich erneut an und speichere anschließend deine erhaltenen Eingaben.</p>
        <LoginPage expectedUserId={user?.id} onAuthenticated={() => setExpired(false)} />
      </Modal>}
      <Suspense fallback={<p role="status">Seite wird geladen …</p>}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<SearchPage />} />
          <Route path="freizeiten/:id" element={<CampDetailPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="registrieren" element={<ProviderRegistrationPage />} />
          <Route path="registrierung-bestaetigen" element={<ProviderVerificationPage />} />
          <Route path="traegerprofil" element={<ProviderProfilePage />} />
          <Route path="anmelden/:campId" element={<BookingPage />} />
          <Route path="buchung" element={<BookingStatusPage />} />
          <Route path="buchungen" element={<ApprovedProviderRoute><BookingManagementPage /></ApprovedProviderRoute>} />
          <Route path="dashboard" element={<ApprovedProviderRoute><ClubDashboard /></ApprovedProviderRoute>} />
          <Route path="dashboard/freizeiten/neu" element={<ApprovedProviderRoute><ClubCampEditorPage mode="create" /></ApprovedProviderRoute>} />
          <Route path="dashboard/freizeiten/:id" element={<ApprovedProviderRoute><ClubCampDetailPage /></ApprovedProviderRoute>} />
          <Route path="dashboard/freizeiten/:id/bearbeiten" element={<ApprovedProviderRoute><ClubCampEditorPage mode="edit" /></ApprovedProviderRoute>} />
          <Route path="dashboard/freizeiten/:id/buchungen" element={<ApprovedProviderRoute><BookingManagementPage /></ApprovedProviderRoute>} />
          <Route path="admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="admin/pruefungen" element={<AdminRoute><PortalAdminPage /></AdminRoute>} />
          <Route path="admin/vereine" element={<AdminRoute><AdminClubsPage /></AdminRoute>} />
          <Route path="admin/freizeiten" element={<AdminRoute><AdminCampsPage /></AdminRoute>} />
          <Route path="admin/freizeiten/:id/bearbeiten" element={<AdminRoute><AdminCampEditorPage /></AdminRoute>} />
          <Route path="admin/ferien" element={<AdminRoute><AdminHolidaysPage /></AdminRoute>} />
          <Route path="admin/auswertung" element={<AdminRoute><AdminReportsPage /></AdminRoute>} />
          <Route path="pruefung" element={<PortalAdminPage />} />
          <Route path="passwort-vergessen" element={<ForgotPasswordPage />} />
          <Route path="passwort-setzen" element={<SetPasswordPage />} />
          <Route path="kontakt" element={<ContactPage />} />
          <Route path="einstellungen" element={<AccountSettingsPage />} />
          <Route path="impressum" element={<Impressum />} />
          <Route path="datenschutz" element={<DatenschutzPage />} />
          <Route path="barrierefreiheit" element={<AccessibilityPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter></MotionConfig>
  );
};

export default App;
