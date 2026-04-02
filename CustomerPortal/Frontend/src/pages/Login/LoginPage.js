import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PasswordInput from "../../components/PasswordInput";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, USER_API } from "../../services/api";
import { getDashboardRoute, getForgotPasswordRoute, hasCustomerSession, storeSession } from "../../utils/session";
import "./Login.css";

export default function CustomerLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (hasCustomerSession()) {
      navigate(getDashboardRoute(), { replace: true });
    }
  }, [navigate]);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast.error("All fields are required");
      return;
    }

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      USER_API.login,
      (response) => {
        if (String(response?.user?.role || "").trim().toLowerCase() !== "customer") {
          toast.error("Please use the staff login page for this account.");
          return;
        }

        storeSession(response.token, response.user, response.expiresAt);
        toast.success("Login successful");
        navigate(getDashboardRoute(), { replace: true });
      },
      (error) => {
        toast.error(error.response?.data?.error || "Login failed");
      },
      "",
      null,
      { email, password }
    ).catch(() => undefined);
  };

  return (
    <section className="auth-shell login-page">
      <div className="auth-shell__backdrop"></div>
      <div className="auth-shell__mesh"></div>

      <div className="auth-shell__layout">
        <div className="auth-shell__hero">
          <span className="auth-shell__badge">Customer Access</span>
          <h1>Customer portal for bookings, updates, and vehicle history.</h1>
          <p>
            Sign in to track service progress, manage your vehicles, and stay connected
            with your workshop from one clean dashboard.
          </p>

          <div className="auth-shell__metrics">
            <div className="auth-shell__metric">
              <span>Vehicle records</span>
              <strong>All registered vehicles stay linked to service history.</strong>
            </div>
            <div className="auth-shell__metric">
              <span>Live updates</span>
              <strong>Follow booking, repair, and delivery progress in one place.</strong>
            </div>
            <div className="auth-shell__metric">
              <span>Fast support</span>
              <strong>Reach chat, feedback, and emergency help without extra steps.</strong>
            </div>
          </div>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card__header">
            <span className="auth-card__eyebrow">Secure Sign In</span>
            <h2>Welcome back</h2>
            <p>Enter your credentials to open your customer workspace.</p>
          </div>

          <label className="auth-card__field">
            <span>Email</span>
            <input
              placeholder="Enter your email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="auth-card__field">
            <span>Password</span>
            <PasswordInput
              placeholder="Enter your password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <div className="auth-card__meta">
            <Link className="auth-card__link" to={getForgotPasswordRoute()}>
              Forgot password?
            </Link>
          </div>

          <button className="auth-card__button" type="submit">
            Sign In
          </button>

          <p className="auth-card__footer">
            Don't have an account?{" "}
            <Link className="auth-card__link" to="/signup">Create one</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
