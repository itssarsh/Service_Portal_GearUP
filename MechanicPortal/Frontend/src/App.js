import { BrowserRouter, Route, Routes } from "react-router-dom";
import MechanicNotificationBridge from "./components/MechanicNotificationBridge";
import { LoadingProvider } from "./components/LoadingProvider";
import { ToastProvider } from "./components/ToastProvider";
import WorkspaceFrame from "./components/WorkspaceFrame";
import {
  MechanicAddServiceRecordPage,
  MechanicAddVehiclePage,
  MechanicBillingPage,
  MechanicChatPage,
  MechanicChangePasswordPage,
  MechanicComplaintsPage,
  MechanicDashboardPage,
  MechanicEmergencyPage,
  MechanicFeedbackPage,
  MechanicForgotPasswordPage,
  MechanicLoginPage,
  MechanicNotificationsPage,
  MechanicProfilePage,
  MechanicResetPasswordPage,
  MechanicSignupPage,
} from "./pages";
import "./App.css";

function App() {
  return (
    <div className="app-shell">
      <LoadingProvider>
        <ToastProvider>
          <BrowserRouter>
            <MechanicNotificationBridge />
            <WorkspaceFrame>
              <Routes>
                <Route path="/" element={<MechanicLoginPage />} />
                <Route path="/workshop/login" element={<MechanicLoginPage />} />
                <Route
                  path="/workshop/forgot-password"
                  element={<MechanicForgotPasswordPage />}
                />
                <Route
                  path="/workshop/reset-password"
                  element={<MechanicResetPasswordPage />}
                />
                <Route
                  path="/workshop/change-password"
                  element={<MechanicChangePasswordPage />}
                />
                <Route path="/workshop/signup" element={<MechanicSignupPage />} />
                <Route path="/workshop/dashboard" element={<MechanicDashboardPage />} />
                <Route path="/workshop/chat" element={<MechanicChatPage />} />
                <Route path="/workshop/complaints" element={<MechanicComplaintsPage />} />
                <Route path="/workshop/notifications" element={<MechanicNotificationsPage />} />
                <Route path="/workshop/emergency" element={<MechanicEmergencyPage />} />
                <Route path="/workshop/feedback" element={<MechanicFeedbackPage />} />
                <Route path="/workshop/billing" element={<MechanicBillingPage />} />
                <Route path="/workshop/vehicles/new" element={<MechanicAddVehiclePage />} />
                <Route
                  path="/workshop/service-records/new"
                  element={<MechanicAddServiceRecordPage />}
                />
                <Route
                  path="/workshop/service-records/:recordId/edit"
                  element={<MechanicAddServiceRecordPage />}
                />
                <Route path="/workshop/profile" element={<MechanicProfilePage />} />
              </Routes>
            </WorkspaceFrame>
          </BrowserRouter>
        </ToastProvider>
      </LoadingProvider>
    </div>
  );
}

export default App;
