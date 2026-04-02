import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, USER_API } from "../../services/api";
import { getDashboardRoute, getLoginRoute, getStoredToken, getStoredUser } from "../../utils/session";
import "./ForgotPassword.css";

export default function CustomerForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (getStoredToken() && getStoredUser()?.role === "customer") {
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
      USER_API.forgotPassword,
      (response) => {
        toast.success(response?.message || "Reset instructions sent");
        setEmail("");
        setIsSubmitting(false);
      },
      (error) => {
        toast.error(error.response?.data?.error || error.response?.data?.message || "Failed to send forgot password request");
        setIsSubmitting(false);
      },
      "",
      null,
      { email: email.trim() }
    ).catch(() => undefined);
  };

  return (
    <section className="auth-shell forgot-password-page">
      <div className="auth-shell__backdrop"></div>
      <div className="auth-shell__mesh"></div>

      <div className="auth-shell__layout">
        <div className="auth-shell__hero">
          <span className="auth-shell__badge">Account Recovery</span>
          <h1>Reset access to your customer account.</h1>
          <p>
            Enter your registered email to receive a secure reset link and
            return to your service workspace.
          </p>

          <div className="auth-shell__metrics">
            <div className="auth-shell__metric">
              <span>Secure recovery</span>
              <strong>Reset instructions are sent only to your registered email.</strong>
            </div>
            <div className="auth-shell__metric">
              <span>Saved history</span>
              <strong>Your vehicles, bookings, and records stay unchanged.</strong>
            </div>
            <div className="auth-shell__metric">
              <span>Fast return</span>
              <strong>Use the link, set a new password, and sign back in.</strong>
            </div>
          </div>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card__header">
            <span className="auth-card__eyebrow">Password Recovery</span>
            <h2>Request reset link</h2>
            <p>Enter your registered email and we will send reset instructions.</p>
          </div>

          <label className="auth-card__field">
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
            {isSubmitting ? "Sending..." : "Send Reset Link"}
          </button>

          <p className="auth-card__footer">
            Remember your password? <Link className="auth-card__link" to={getLoginRoute()}>Back to login</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
