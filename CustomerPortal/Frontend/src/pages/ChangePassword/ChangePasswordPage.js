import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PasswordInput from "../../components/PasswordInput";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, USER_API } from "../../services/api";
import {
  clearSession,
  getDashboardRoute,
  getLoginRoute,
  getProfileRoute,
  getStoredToken,
  isAuthError,
} from "../../utils/session";
import "./ChangePassword.css";

export default function CustomerChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  // const passwordChecks = [
  //   {
  //     label: "Minimum 6 characters",
  //     met: newPassword.length >= 6,
  //   },
  //   {
  //     label: "Different from current password",
  //     met: Boolean(newPassword) && newPassword !== currentPassword,
  //   },
  //   {
  //     label: "Confirmation matches",
  //     met: Boolean(confirmPassword) && newPassword === confirmPassword,
  //   },
  // ];

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
    }
  }, [navigate]);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      toast.error("All password fields are required");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (currentPassword === newPassword) {
      toast.error("New password must be different from current password");
      return;
    }

    setIsSubmitting(true);

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      USER_API.changePassword,
      (response) => {
        toast.success(response?.message || "Password changed successfully");
        setIsSubmitting(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        window.setTimeout(() => navigate(getProfileRoute()), 1000);
      },
      (error) => {
        if (isAuthError(error)) {
          toast.error(error.response?.data?.error || "Please login again.");
          clearSession();
          navigate(getLoginRoute(), { replace: true });
          setIsSubmitting(false);
          return;
        }
        toast.error(error.response?.data?.error || "Failed to change password");
        setIsSubmitting(false);
      },
      "",
      null,
      {
        currentPassword,
        newPassword,
        confirmPassword,
      }
    ).catch(() => undefined);
  };

  return (
    <section className="change-password-page">
      <div className="change-password-page__backdrop"></div>
      <div className="change-password-page__mesh"></div>

      <div className="change-password-container">
        <header className="change-password-hero">
          <div className="change-password-hero__content">
            <p className="change-password-hero__eyebrow">Account security</p>
            <h1>Update your account password.</h1>
            <p className="change-password-hero__description">
              Keep your customer account secure without affecting vehicles, bookings, or service history.
            </p>

            <div className="change-password-hero__actions">
              <Link className="change-password-hero__secondary" to={getDashboardRoute()}>
                Back to Dashboard
              </Link>
            </div>

            <div className="change-password-hero__meta">
              <div>
                <strong>Fast update</strong>
                <span>Complete the password change in under a minute.</span>
              </div>
              <div>
                <strong>Profile stays intact</strong>
                <span>Your vehicles, bookings, and service history remain unchanged.</span>
              </div>
              <div>
                <strong>Safer access</strong>
                <span>Use a fresh password to reduce the chance of account misuse.</span>
              </div>
            </div>
          </div>

          <aside className="change-password-summary">
            <div className="change-password-summary__icon">S</div>
            <div className="change-password-summary__identity">
              <h2>Password rules</h2>
              <span>Customer account protection</span>
            </div>
            <div className="change-password-summary__details">
              <div>
                <span>Password rule</span>
                <strong>Use a minimum of 6 characters</strong>
              </div>
              <div>
                <span>Best practice</span>
                <strong>Choose a new password that is clearly different from the current one</strong>
              </div>
            </div>
            <p className="change-password-summary__note">
              A stronger password keeps your customer account safer.
            </p>
          </aside>
        </header>

        <section className="change-password-grid">
          <form className="change-password-card" onSubmit={handleSubmit}>
            <div className="change-password-card__header">
              <p className="change-password-card__eyebrow">Access Control</p>
              <h2>Update account password</h2>
              <span>Enter your current password, then confirm the new one to finish the update.</span>
            </div>

            <div className="change-password-form">
              <label className="change-password-form__field" htmlFor="currentPassword">
                <span>Current Password</span>
                <PasswordInput
                  id="currentPassword"
                  placeholder="Enter current password"
                  value={currentPassword}
                  disabled={isSubmitting}
                  autoComplete="current-password"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>

              <label className="change-password-form__field" htmlFor="newPassword">
                <span>New Password</span>
                <PasswordInput
                  id="newPassword"
                  placeholder="Enter new password (min 6 characters)"
                  value={newPassword}
                  disabled={isSubmitting}
                  autoComplete="new-password"
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>

              <label className="change-password-form__field" htmlFor="confirmPassword">
                <span>Confirm New Password</span>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  disabled={isSubmitting}
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
            </div>

            {/* <div className="change-password-form__checks" aria-live="polite">
              {passwordChecks.map(({ label, met }) => (
                <div
                  key={label}
                  className={`change-password-form__check ${met ? "change-password-form__check--complete" : ""}`}
                >
                  <span className="change-password-form__check-indicator" aria-hidden="true">
                    {met ? "✓" : ""}
                  </span>
                  <strong>{label}</strong>
                </div>
              ))}
            </div> */}

            <div className="change-password-card__actions">
              <button
                className="change-password-form__submit"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Updating..." : "Save New Password"}
              </button>

              <button
                className="change-password-form__back"
                type="button"
                onClick={() => navigate(getProfileRoute())}
              >
                Cancel
              </button>
            </div>
          </form>

          <aside className="change-password-side-card">
            <div className="change-password-card__header">
              <p className="change-password-card__eyebrow">Security guidance</p>
              <h3>Choose a stronger password</h3>
            </div>

            <div className="change-password-side-card__list">
              <div>
                <span>Avoid reuse</span>
                <strong>Don’t reuse the same password from other apps or sites.</strong>
              </div>
              <div>
                <span>Keep it memorable</span>
                <strong>Use a phrase or combination that is easy for you but hard to guess.</strong>
              </div>
              <div>
                <span>Update regularly</span>
                <strong>Change it after suspicious activity or shared-device usage.</strong>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </section>
  );
}
