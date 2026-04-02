import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, FORGOT_PASSWORD_API } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import {
  getDashboardRoute,
  getLoginRoute,
  getStoredToken,
  getStoredUser,
  isMechanicRole,
} from "../../utils/session";
import "./ForgotPassword.css";

export default function MechanicForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (getStoredToken() && isMechanicRole(getStoredUser()?.role)) {
      navigate(getDashboardRoute(), { replace: true });
    }
  }, [navigate]);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }

    setIsSubmitting(true);

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      FORGOT_PASSWORD_API(),
      (response) => {
        toast.success(response?.message || "Reset instructions sent");
        setEmail("");
        setIsSubmitting(false);
      },
      (error) => {
        toast.error(
          error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to send forgot password request"
        );
        setIsSubmitting(false);
      },
      "",
      null,
      { email: email.trim() }
    ).catch(() => {
      return undefined;
    });
  };

  return (
    <section className="auth-page forgot-password-page">
      <div className="auth-page__backdrop"></div>

      <div className="auth-layout forgot-password-layout">
        <div className="auth-hero forgot-password-hero">
          <span className="auth-badge">Password Recovery</span>
          <h1>Reset workshop access securely.</h1>
          <p>Request a password reset link for your registered workshop account.</p>

          <div className="auth-highlights auth-highlights--single forgot-password-highlights">
            <div className="auth-highlight">
              <strong>Secure reset flow</strong>
              <span>If the email exists, reset instructions will be sent to that inbox.</span>
            </div>
          </div>
        </div>

        <form className="auth-card forgot-password-card" onSubmit={handleSubmit}>
          <div className="auth-card__header">
            <p className="auth-card__eyebrow">Account Recovery</p>
            <h2>Request reset link</h2>
            <span>Enter your registered workshop email.</span>
          </div>

          <label className="auth-field">
            <span>Email</span>
            <input
              placeholder="Enter your registered email"
              type="email"
              value={email}
              disabled={isSubmitting}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <button className="auth-card__button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send reset link"}
          </button>

          <p className="auth-card__footer">
            Remember your password? <Link to={getLoginRoute()}>Back to login</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
