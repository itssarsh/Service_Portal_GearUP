import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, USER_API } from "../../services/api";
import {
  clearSession,
  getDashboardRoute,
  getEditProfileRoute,
  getLoginRoute,
  getStoredToken,
  getStoredUser,
  isAuthError,
} from "../../utils/session";
import { formatDisplayDate } from "../../utils/formatters";
import "./Profile.css";

export default function CustomerProfilePage() {
  const [profile, setProfile] = useState(() => getStoredUser());
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    const handleProfileLoadError = (error) => {
      if (isAuthError(error)) {
        toast.error(error.response?.data?.error || "Please login again.");
        clearSession();
        navigate(getLoginRoute(), { replace: true });
        return;
      }

      toast.error(error.response?.data?.error || "Profile data load nahi ho saki.");
    };

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      USER_API.profile,
      (response) => setProfile(response),
      handleProfileLoadError,
      "",
      null,
      {}
    ).catch(() => undefined);
  }, [navigate, toast]);

  const joinedOn = formatDisplayDate(profile?.created_at, "Recently joined");
  const verificationLabel = profile?.phone_verified ? "Verified" : "Pending OTP verification";
  const completionFields = [
    profile?.name,
    profile?.email,
    profile?.phone,
    profile?.address,
    profile?.state,
    profile?.city,
    profile?.pincode,
    profile?.vehicle_type || profile?.vehicle_model || profile?.vehicle_number,
  ];
  const profileCompletion = Math.round(
    (completionFields.filter((value) => Boolean(value)).length / completionFields.length) * 100
  );
  const profileCompletionLabel = profileCompletion >= 100 ? "Account ready" : "In progress";

  return (
    <section className="profile-page">
      <div className="profile-page__backdrop"></div>

      <div className="profile-container">
        <header className="profile-hero">
          <div className="profile-hero__content">
            <p className="profile-hero__eyebrow">Customer profile</p>
            <h1>Manage your customer account.</h1>
            <p className="profile-hero__description">
              Review contact details, location coverage, and default vehicle information from one workspace.
            </p>

            <div className="profile-hero__actions">
              <Link className="profile-hero__secondary" to={getDashboardRoute()}>
                Back to Dashboard
              </Link>
              <Link className="profile-hero__button" to={getEditProfileRoute()}>
                Edit Profile
              </Link>
            </div>
          </div>

          <aside className="profile-summary">
            <div className="profile-summary__top">
              <div className="profile-summary__avatar">
                {profile?.name?.charAt(0)?.toUpperCase() || "C"}
              </div>
              <div className="profile-summary__identity">
                <h2>{profile?.name || "User"}</h2>
                <span>{profile?.role || "customer"}</span>
              </div>
            </div>

            <div className="profile-summary__highlights">
              <div className="profile-summary__highlight">
                <span>Email</span>
                <strong>{profile?.email || "Not available"}</strong>
              </div>
              <div className="profile-summary__highlight">
                <span>Phone</span>
                <strong>{profile?.phone || "Not available"}</strong>
              </div>
            </div>

            <div className="profile-summary__status">
              <div className="profile-summary__status-item">
                <span>Current status</span>
                <strong>Active</strong>
              </div>
              <div className="profile-summary__status-item">
                <span>Member since</span>
                <strong>{joinedOn}</strong>
              </div>
              <div className="profile-summary__status-item profile-summary__status-item--completion">
                <div
                  className="profile-summary__progress"
                  style={{ "--profile-progress": `${profileCompletion}%` }}
                >
                  <span>{profileCompletion}%</span>
                </div>
                <div className="profile-summary__progress-copy">
                  <span>Profile completion</span>
                  <strong>{profileCompletionLabel}</strong>
                </div>
              </div>
            </div>
          </aside>
        </header>

        <section className="profile-grid">
          <article className="profile-card">
            <div className="profile-card__header">
              <p className="profile-card__eyebrow">Profile overview</p>
              <h3>Account details</h3>
              <span>Your customer account information and service details are shown here.</span>
            </div>

            <div className="profile-details">
              {[
                { label: "Full name", value: profile?.name || "User" },
                { label: "Email address", value: profile?.email || "Not available" },
                { label: "Phone number", value: profile?.phone || "Not available" },
                { label: "Role", value: profile?.role || "customer" },
                { label: "Address", value: profile?.address || "Not available" },
                { label: "State", value: profile?.state || "Not available" },
                { label: "City", value: profile?.city || "Not available" },
                { label: "Locality / area", value: profile?.locality || "Not available" },
                { label: "Pincode", value: profile?.pincode || "Not available" },
                { label: "Phone verification", value: verificationLabel },
                { label: "Vehicle type", value: profile?.vehicle_type || "Not provided" },
                { label: "Vehicle model", value: profile?.vehicle_model || "Not provided" },
                { label: "Vehicle number", value: profile?.vehicle_number || "Not provided" },
                { label: "Joined on", value: formatDisplayDate(profile?.created_at, "Not available") },
                { label: "Primary access", value: "View own vehicles and history" },
                { label: "Account status", value: "Active" },
              ].map((item) => (
                <div className="profile-detail" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </section>
  );
}
