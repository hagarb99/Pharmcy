import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

import { Home } from './pages/Home';
import { Login } from './pages/auth/Login';
import { RegisterPatient } from './pages/auth/RegisterPatient';
import { RegisterPharmacy } from './pages/auth/RegisterPharmacy';
import { VerifyOTP } from './pages/auth/VerifyOTP';
import { PatientDashboard } from './pages/patient/PatientDashboard';
import { PharmacyDashboard } from './pages/pharmacy/PharmacyDashboard';
import { AdminDashboard } from './pages/admin/AdminDashboard';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-container">
          <Navbar />
          <main className="main-content">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<RegisterPatient />} />
              <Route path="/register-pharmacy" element={<RegisterPharmacy />} />
              <Route path="/verify-otp" element={<VerifyOTP />} />

              {/* Protected Patient Routes */}
              <Route
                path="/patient"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <PatientDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Protected Pharmacy Routes */}
              <Route
                path="/pharmacy"
                element={
                  <ProtectedRoute allowedRoles={['pharmacy']}>
                    <PharmacyDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Protected Admin Routes */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
