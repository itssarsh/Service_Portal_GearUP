import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PasswordInput from "../../components/PasswordInput";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, LOGIN_API } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import { getDashboardRoute, getForgotPasswordRoute, getStoredToken, getStoredUser, isMechanicRole, storeSession, } from "../../utils/session";
import "./Login.css";

export default function MechanicLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (getStoredToken() && isMechanicRole(getStoredUser()?.role)) {
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
      LOGIN_API(),
      (response) => {
        if (!isMechanicRole(response?.user?.role)) {
          toast.error("Please use the customer login page for this account.");
          return;
        }

        storeSession(response.token, response.user);
        toast.success("Login successful");
        navigate(getDashboardRoute(), { replace: true });
      },
      (error) => {
        toast.error(error.response?.data?.error || "Login failed");
      },
      "",
      null,
      { email, password }
    ).catch(() => {
      return undefined;
    });
  };

  return (
    <section className="auth-page login-page">
      <div className="auth-page__backdrop"></div>
      <div className="auth-layout login-layout">
        <div className="auth-hero login-hero">
          <span className="auth-badge">Workshop Control</span>
          <h1>Access the workshop workspace.</h1>
          <p>Manage jobs, vehicles, customer updates, and billing from one secure console.</p>

          <div className="auth-highlights login-highlights">
            <div className="auth-highlight">
              <strong>Live operations</strong>
              <span>Track intake, work progress, and delivery readiness in one place.</span>
            </div>
            <div className="auth-highlight">
              <strong>Approved access</strong>
              <span>Built for mechanic and admin teams running day-to-day workshop work.</span>
            </div>
          </div>
        </div>

        <form className="auth-card login-card" onSubmit={handleSubmit}>
          <div className="auth-card__header">
            <p className="auth-card__eyebrow">Secure Sign In</p>
            <h2>Sign in</h2>
            <span>Use your approved mechanic or admin credentials.</span>
          </div>

          <label className="auth-field">
            <span>Email</span>
            <input
              placeholder="Enter your email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <PasswordInput
              placeholder="Enter your password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <div className="auth-card__meta">
            <Link className="auth-inline-link" to={getForgotPasswordRoute()}>
              Forgot password?
            </Link>
          </div>

          <button className="auth-card__button" type="submit">
            Sign In
          </button>

          <p className="auth-card__footer">
            Need a new team account? <Link to="/workshop/signup">Create one</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
