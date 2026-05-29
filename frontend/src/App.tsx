import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SearchPage } from './pages/SearchPage';
import { LoginPage } from './pages/LoginPage';
import { ClubDashboard } from './pages/ClubDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { Impressum } from './pages/Impressum';
import { CampDetailPage } from './pages/CampDetailPage';
import './index.css';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<SearchPage />} />
          <Route path="freizeiten/:id" element={<CampDetailPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="dashboard" element={<ClubDashboard />} />
          <Route path="admin" element={<AdminDashboard />} />
          <Route path="impressum" element={<Impressum />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
