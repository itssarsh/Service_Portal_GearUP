import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import CustomerNotificationBridge from "./components/CustomerNotificationBridge";
import CustomerWorkspaceFrame from "./components/CustomerWorkspaceFrame";
import { LoadingProvider } from "./components/LoadingProvider";
import { ToastProvider } from "./components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, USER_API } from "./services/api";
import {
  clearSession,
  getDashboardRoute,
  getLoginRoute,
  hasCustomerSession,
  storeSession,
  getStoredToken,
} from "./utils/session";

import {
  CustomerAddServiceRecordPage,
  CustomerAddVehiclePage,
  CustomerDashboardPage,
  CustomerForgotPasswordPage,
  CustomerLoginPage,
  CustomerProfilePage,
  CustomerResetPasswordPage,
  CustomerSignupPage,
  CustomerChangePasswordPage,
  CustomerEditProfilePage,
  CustomerChatPage,
  CustomerNotificationsPage,
  CustomerFeedbackPage,
  CustomerPortalFeedbackPage,
  CustomerComplaintPage,
  CustomerEmergencyPage,
} from "./pages";

import "./App.css";

function ProtectedRoute({ children }) {
  return hasCustomerSession() ? children : <Navigate to={getLoginRoute()} replace />;
}

function PublicRoute({ children }) {
  return hasCustomerSession() ? <Navigate to={getDashboardRoute()} replace /> : children;
}

function AppRoutes() {
  const [isBootstrappingSession, setIsBootstrappingSession] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapSession() {
      if (!hasCustomerSession()) {
        if (isMounted) {
          setIsBootstrappingSession(false);
        }
        return;
      }

      try {
        const response = await makeApiCall(
          API_CALL_TYPE.GET_CALL,
          USER_API.profile,
          null,
          null,
          "",
          null,
          {},
          { skipGlobalLoader: true }
        );
        const token = getStoredToken();

        if (token) {
          storeSession(token, response);
        }
      } catch (error) {
        if ([401, 403].includes(error.response?.status)) {
          clearSession();
        }
      } finally {
        if (isMounted) {
          setIsBootstrappingSession(false);
        }
      }
    }

    bootstrapSession();

    return () => {
      isMounted = false;
    };
  }, []);

  if (isBootstrappingSession) {
    return null;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={(
          <PublicRoute>
            <CustomerLoginPage />
          </PublicRoute>
        )}
      />

      <Route
        path="/login"
        element={(
          <PublicRoute>
            <CustomerLoginPage />
          </PublicRoute>
        )}
      />
      <Route
        path="/signup"
        element={(
          <PublicRoute>
            <CustomerSignupPage />
          </PublicRoute>
        )}
      />
      <Route
        path="/forgot-password"
        element={(
          <PublicRoute>
            <CustomerForgotPasswordPage />
          </PublicRoute>
        )}
      />
      <Route
        path="/reset-password"
        element={(
          <PublicRoute>
            <CustomerResetPasswordPage />
          </PublicRoute>
        )}
      />

      <Route
        path="/dashboard"
        element={(
          <ProtectedRoute>
            <CustomerDashboardPage />
          </ProtectedRoute>
        )}
      />

      <Route
        path="/vehicles/new"
        element={(
          <ProtectedRoute>
            <CustomerAddVehiclePage />
          </ProtectedRoute>
        )}
      />

      <Route
        path="/service-records/new"
        element={(
          <ProtectedRoute>
            <CustomerAddServiceRecordPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/service-records/:recordId/edit"
        element={(
          <ProtectedRoute>
            <CustomerAddServiceRecordPage />
          </ProtectedRoute>
        )}
      />

      <Route
        path="/profile"
        element={(
          <ProtectedRoute>
            <CustomerProfilePage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/profile/edit"
        element={
          <ProtectedRoute>
            <CustomerEditProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <CustomerChangePasswordPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <CustomerChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <CustomerNotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/feedback"
        element={
          <ProtectedRoute>
            <CustomerPortalFeedbackPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/feedback/:recordId"
        element={
          <ProtectedRoute>
            <CustomerFeedbackPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/complaints/:recordId"
        element={
          <ProtectedRoute>
            <CustomerComplaintPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/emergency"
        element={
          <ProtectedRoute>
            <CustomerEmergencyPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="app-shell">
      <LoadingProvider>
        <ToastProvider>
          <BrowserRouter>
            <CustomerNotificationBridge />
            <CustomerWorkspaceFrame>
              <AppRoutes />
            </CustomerWorkspaceFrame>
          </BrowserRouter>
        </ToastProvider>
      </LoadingProvider>
    </div>
  );
}

export default App;
