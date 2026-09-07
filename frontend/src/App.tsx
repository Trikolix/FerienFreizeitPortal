import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { MotionConfig } from 'framer-motion';
import { AccessibilityPage } from './pages/AccessibilityPage';
import { NotFoundPage } from './pages/NotFoundPage';

const ClubDashboard = lazy(() => import('./pages/ClubDashboard').then((m) => ({ default: m.ClubDashboard })));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));

export const App: React.FC = () => {
  const { initialized, initialize, user, error } = useAuthStore();
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    void initialize();
    const onExpiry = () => setExpired(true);
    window.addEventListener('session-expired', onExpiry);
    return () => window.removeEventListener('session-expired', onExpiry);
  }, [initialize]);
  if (!initialized) return <p role="status">Portal wird geladen …</p>;
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
          <Route path="passwort-vergessen" element={<ForgotPasswordPage />} />
          <Route path="passwort-setzen" element={<SetPasswordPage />} />
          <Route path="kontakt" element={<ContactPage />} />
          <Route path="dashboard" element={<ClubDashboard />} />
          <Route path="admin" element={<AdminDashboard />} />
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
