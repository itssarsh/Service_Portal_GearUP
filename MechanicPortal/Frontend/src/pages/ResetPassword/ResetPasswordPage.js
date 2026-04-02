import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PasswordInput from "../../components/PasswordInput";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, RESET_PASSWORD_API } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import {
  getDashboardRoute,
  getForgotPasswordRoute,
  getLoginRoute,
  getStoredToken,
  getStoredUser,
  isMechanicRole,
} from "../../utils/session";
import "./ResetPassword.css";

export default function MechanicResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const email = useMemo(() => searchParams.get("email")?.trim() || "", [searchParams]);
  const token = useMemo(() => searchParams.get("token")?.trim() || "", [searchParams]);
  const hasValidResetParams = Boolean(email && token);

  useEffect(() => {
    if (getStoredToken() && isMechanicRole(getStoredUser()?.role)) {
      navigate(getDashboardRoute(), { replace: true });
    }
  }, [navigate]);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!hasValidResetParams) {
      toast.error("Reset link is invalid. Please request a new link.");
      return;
    }

    if (!password.trim() || !confirmPassword.trim()) {
      toast.error("All fields are required");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsSubmitting(true);

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      RESET_PASSWORD_API(),
      (response) => {
        toast.success(response?.message || "Password reset successful");
        setIsSubmitting(false);
        window.setTimeout(() => navigate(getLoginRoute()), 900);
      },
      (error) => {
        toast.error(error.response?.data?.message || "Failed to reset password");
        setIsSubmitting(false);
      },
      "",
      null,
      {
        email,
        token,
        newPassword: password,
      }
    ).catch(() => {
      return undefined;
    });
  };

  return (
    <section className="auth-page reset-password-page">
      <div className="auth-page__backdrop"></div>

      <div className="auth-layout">
        <div className="auth-hero">
          <span className="auth-badge">Password Recovery</span>
          <h1>Complete recovery and restore secure access to your workshop workspace.</h1>
          <p>
            Use the signed reset link from your email, verify the account context, and create a stronger
            password for day-to-day workshop usage.
          </p>

          <div className="auth-highlights auth-highlights--single">
            <div className="auth-highlight">
              <strong>Validated reset token</strong>
              <span>
                This page requires a valid token and email in the URL. If either is missing or expired,
                request a fresh recovery link.
              </span>
            </div>
          </div>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card__header">
            <p className="auth-card__eyebrow">Credential Reset</p>
            <h2>Set a new secure password</h2>
            <span>Create fresh credentials for this workshop account.</span>
          </div>

          <label className="auth-field">
            <span>Email</span>
            <input type="email" value={email} disabled />
          </label>

          <label className="auth-field">
            <span>New Password</span>
            <PasswordInput
              placeholder="Enter new password"
              value={password}
              disabled={isSubmitting || !hasValidResetParams}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Confirm Password</span>
            <PasswordInput
              placeholder="Re-enter new password"
              value={confirmPassword}
              disabled={isSubmitting || !hasValidResetParams}
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>

          {!hasValidResetParams && (
            <p className="auth-card__notice">
              The reset token or email is missing from the URL. Please use Forgot Password
              to generate a new link first.
            </p>
          )}

          <button
            className="auth-card__button"
            type="submit"
            disabled={isSubmitting || !hasValidResetParams}
          >
            {isSubmitting ? "Updating..." : "Activate new password"}
          </button>

          <p className="auth-card__footer">
            Need a new reset link? <Link to={getForgotPasswordRoute()}>Forgot password</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
