import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PasswordInput from "../../components/PasswordInput";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, CHANGE_PASSWORD_API } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import {
  getDashboardRoute,
  getLoginRoute,
  getStoredToken,
  getStoredUser,
} from "../../utils/session";
import "./ChangePassword.css";

export default function MechanicChangePasswordPage() {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const storedUser = getStoredUser();

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
    }
  }, [navigate]);

  const updateField = (field) => (event) => {
    setForm((previousForm) => ({
      ...previousForm,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.currentPassword.trim() || !form.newPassword.trim() || !form.confirmPassword.trim()) {
      toast.error("All fields are required");
      return;
    }

    if (form.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (form.currentPassword === form.newPassword) {
      toast.error("New password must be different from current password");
      return;
    }

    setIsSubmitting(true);

    makeApiCall(
      API_CALL_TYPE.PUT_CALL,
      CHANGE_PASSWORD_API(),
      (response) => {
        toast.success(response?.message || "Password changed successfully");
        setForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setIsSubmitting(false);
      },
      (error) => {
        toast.error(
          error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to change password"
        );
        setIsSubmitting(false);
      },
      "",
      null,
      {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }
    ).catch(() => undefined);
  };

  return (
    <section className="auth-page change-password-page">
      <div className="auth-page__backdrop"></div>

      <div className="auth-layout">
        <div className="auth-hero">
          <span className="auth-badge">Account Security</span>
          <h1>Refresh your credentials without stepping out of the active workspace.</h1>
          <p>
            Verify your identity with the current password, then rotate to a stronger credential for
            safer day-to-day workshop access.
          </p>

          <Link className="auth-inline-link change-password-page__back-link" to={getDashboardRoute()}>
            Back to dashboard
          </Link>

          <div className="auth-highlights">
            <div className="auth-highlight">
              <strong>Verified account action</strong>
              <span>
                This flow is reserved for signed-in mechanic and admin users who want to update
                credentials directly from the live workspace.
              </span>
            </div>
            <div className="auth-highlight">
              <strong>Minimal downtime</strong>
              <span>
                After changing your password, you can continue using the product without opening
                a separate recovery flow.
              </span>
            </div>
          </div>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card__header">
            <p className="auth-card__eyebrow">Credential Rotation</p>
            <h2>Update account security</h2>
            <span>Confirm your current password and set a stronger replacement.</span>
          </div>

          <label className="auth-field">
            <span>Email</span>
            <input type="email" value={storedUser?.email || ""} disabled />
          </label>

          <label className="auth-field">
            <span>Current Password</span>
            <PasswordInput
              placeholder="Enter current password"
              value={form.currentPassword}
              disabled={isSubmitting}
              autoComplete="current-password"
              onChange={updateField("currentPassword")}
            />
          </label>

          <label className="auth-field">
            <span>New Password</span>
            <PasswordInput
              placeholder="Enter new password"
              value={form.newPassword}
              disabled={isSubmitting}
              autoComplete="new-password"
              onChange={updateField("newPassword")}
            />
          </label>

          <label className="auth-field">
            <span>Confirm Password</span>
            <PasswordInput
              placeholder="Re-enter new password"
              value={form.confirmPassword}
              disabled={isSubmitting}
              autoComplete="new-password"
              onChange={updateField("confirmPassword")}
            />
          </label>

          <button className="auth-card__button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>
    </section>
  );
}
