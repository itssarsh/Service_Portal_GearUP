import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PasswordInput from "../../components/PasswordInput";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, USER_API } from "../../services/api";
import {
  getDashboardRoute,
  getForgotPasswordRoute,
  getLoginRoute,
  getStoredToken,
  getStoredUser,
} from "../../utils/session";
import "./ResetPassword.css";

export default function CustomerResetPasswordPage() {
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
    if (getStoredToken() && getStoredUser()?.role === "customer") {
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
      USER_API.resetPassword,
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
    ).catch(() => undefined);
  };

  return (
    <section className="auth-shell reset-password-page">
      <div className="auth-shell__backdrop"></div>
      <div className="auth-shell__mesh"></div>

      <div className="auth-shell__layout">
        <div className="auth-shell__hero">
          <span className="auth-shell__badge">Password Reset</span>
          <h1>Create a new password for your customer account.</h1>
          <p>
            Use the link from your email to set a fresh password and continue
            with your saved customer data intact.
          </p>

          <div className="auth-shell__metrics">
            <div className="auth-shell__metric">
              <span>Verified flow</span>
              <strong>Reset requires the recovery token and your registered email.</strong>
            </div>
            <div className="auth-shell__metric">
              <span>Data continuity</span>
              <strong>Vehicles, chats, and service records stay available.</strong>
            </div>
            <div className="auth-shell__metric">
              <span>Quick return</span>
              <strong>Update the password and sign in again right away.</strong>
            </div>
          </div>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card__header">
            <span className="auth-card__eyebrow">Reset Password</span>
            <h2>Create a new password</h2>
            <p>Set a fresh password for your account and continue securely.</p>
          </div>

          <label className="auth-card__field">
            <span>Email</span>
            <input type="email" value={email} disabled />
          </label>

          <label className="auth-card__field">
            <span>New Password</span>
            <PasswordInput
              placeholder="Enter new password"
              value={password}
              disabled={isSubmitting || !hasValidResetParams}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className="auth-card__field">
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
              This recovery link is incomplete. Request a fresh password reset email to continue.
            </p>
          )}

          <button
            className="auth-card__button"
            type="submit"
            disabled={isSubmitting || !hasValidResetParams}
          >
            {isSubmitting ? "Updating..." : "Update Password"}
          </button>

          <p className="auth-card__footer">
            Need a new reset link? <Link className="auth-card__link" to={getForgotPasswordRoute()}>Forgot password</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
