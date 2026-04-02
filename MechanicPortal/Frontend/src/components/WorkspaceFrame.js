import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  clearSession,
  getAddServiceRoute,
  getAddVehicleRoute,
  getBillingRoute,
  getChatRoute,
  getComplaintsRoute,
  getDashboardRoute,
  getEmergencyRoute,
  getFeedbackRoute,
  getLoginRoute,
  getNotificationsRoute,
  getProfileRoute,
  getStoredUser,
} from "../utils/session";
import "./WorkspaceFrame.css";

const hiddenShellRoutes = new Set([
  "/",
  "/workshop/login",
  "/workshop/signup",
  "/workshop/forgot-password",
  "/workshop/reset-password",
  "/workshop/change-password",
]);

const navigationGroups = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard", to: getDashboardRoute(), icon: "DB" },
      { label: "Vehicles", to: getAddVehicleRoute(), icon: "VH" },
      { label: "Service Records", to: getAddServiceRoute(), icon: "SR" },
      { label: "Billing", to: getBillingRoute(), icon: "BL" },
    ],
  },
  {
    label: "Engagement",
    items: [
      { label: "Chat", to: getChatRoute(), icon: "CH" },
      { label: "Notifications", to: getNotificationsRoute(), icon: "NT" },
      { label: "Complaints", to: getComplaintsRoute(), icon: "CP" },
      // { label: "Emergency", to: getEmergencyRoute(), icon: "EM", tone: "danger" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Profile", to: getProfileRoute(), icon: "PF" },
      { label: "Feedback", to: getFeedbackRoute(), icon: "FB" },
    ],
  },
];

function getPageMeta(pathname) {
  if (pathname.startsWith("/workshop/service-records/")) {
    return {
      eyebrow: "Service Operations",
      title: "Service record command center",
      description: "Capture intake, labour, billing readiness, and delivery timelines from a single screen.",
    };
  }

  if (pathname.startsWith("/workshop/vehicles/")) {
    return {
      eyebrow: "Vehicle Intake",
      title: "Customer vehicle onboarding",
      description: "Standardize registration capture so every job starts with complete and searchable vehicle data.",
    };
  }

  const pageMetaMap = {
    [getDashboardRoute()]: {
      eyebrow: "Operations Overview",
      title: "Workshop control tower",
      description: "Track daily throughput, service commitments, customer updates, and financial movement from one executive view.",
    },
    [getBillingRoute()]: {
      eyebrow: "Revenue Operations",
      title: "Billing and collections workspace",
      description: "Keep invoice generation, payment status, and revenue visibility aligned with live service execution.",
    },
    [getChatRoute()]: {
      eyebrow: "Customer Communication",
      title: "Conversation desk",
      description: "Centralize customer conversations, progress proofs, and repair clarifications without leaving the workflow.",
    },
    [getNotificationsRoute()]: {
      eyebrow: "Live Alerts",
      title: "Notification stream",
      description: "Monitor operational signals, customer events, and escalations the moment they require action.",
    },
    [getComplaintsRoute()]: {
      eyebrow: "Case Handling",
      title: "Complaint resolution queue",
      description: "Turn complaint intake into a structured review process with clear responses, ownership, and closure.",
    },
    [getEmergencyRoute()]: {
      eyebrow: "Rapid Response",
      title: "Emergency response board",
      description: "Coordinate urgent roadside support with faster dispatch, status clarity, and escalation control.",
    },
    [getProfileRoute()]: {
      eyebrow: "Access and Identity",
      title: "Workshop profile hub",
      description: "Manage account information, team identity, and usage context in a cleaner operational profile.",
    },
    [getFeedbackRoute()]: {
      eyebrow: "Product Quality",
      title: "Feedback and product signals",
      description: "Capture operator feedback that helps improve workflow reliability and day-to-day usability.",
    },
  };

  return pageMetaMap[pathname] || {
    eyebrow: "Workshop Platform",
    title: "Mechanic operations suite",
    description: "A unified workspace for intake, repair tracking, customer updates, emergency handling, and billing.",
  };
}

export default function WorkspaceFrame({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [location.pathname]);

  useEffect(() => {
    if (!isLogoutConfirmOpen) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsLogoutConfirmOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isLogoutConfirmOpen]);

  if (hiddenShellRoutes.has(location.pathname)) {
    return children;
  }

  const pageMeta = getPageMeta(location.pathname);
  const formattedDate = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());

  const handleLogout = () => {
    clearSession();
    navigate(getLoginRoute(), { replace: true });
    setIsLogoutConfirmOpen(false);
  };

  return (
    <div className="workspace-frame">
      <aside className="workspace-frame__sidebar">
        <div className="workspace-frame__brand">
          <div className="workspace-frame__brand-mark" aria-hidden="true">
            MX
          </div>
          <div>
            <strong>MechanicOS</strong>
            <span>Workshop Operations Suite</span>
          </div>
        </div>

        {/* <div className="workspace-frame__story">
          <span className="workspace-frame__story-badge">Production Workspace</span>
          <h2>Built for day-to-day workshop execution, not demo screens.</h2>
          <p>
            Intake, service tracking, billing, complaints, communication, and emergency
            handling now sit under one consistent operating layer.
          </p>
        </div> */}

        <nav className="workspace-frame__nav" aria-label="Primary">
          {navigationGroups.map((group) => (
            <div className="workspace-frame__nav-group" key={group.label}>
              <p className="workspace-frame__nav-label">{group.label}</p>
              <div className="workspace-frame__nav-items">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    className={({ isActive }) =>
                      `workspace-frame__nav-link${isActive ? " workspace-frame__nav-link--active" : ""}${
                        item.tone === "danger" ? " workspace-frame__nav-link--danger" : ""
                      }`
                    }
                    to={item.to}
                  >
                    <span className="workspace-frame__nav-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* <div className="workspace-frame__sidebar-footer">
          <div className="workspace-frame__status-card">
            <span>Environment</span>
            <strong>Live workshop-ready interface</strong>
          </div>
          <div className="workspace-frame__status-card">
            <span>Focus</span>
            <strong>Faster response, cleaner records, stronger trust</strong>
          </div>
        </div> */}
      </aside>

      <div className="workspace-frame__main">
        <header className="workspace-frame__topbar">
          <div className="workspace-frame__headline">
            <span>{pageMeta.eyebrow}</span>
            <h1>{pageMeta.title}</h1>
            <p>{pageMeta.description}</p>
          </div>

          <div className="workspace-frame__actions">
            <div className="workspace-frame__date-card">
              <span>Today</span>
              <strong>{formattedDate}</strong>
            </div>

            <div className="workspace-frame__user-card">
              <div className="workspace-frame__user-avatar" aria-hidden="true">
                {String(currentUser?.name || "M").trim().charAt(0).toUpperCase() || "M"}
              </div>
              <div>
                <strong>{currentUser?.name || "Workshop User"}</strong>
                <span>{currentUser?.role || "mechanic"}</span>
              </div>
            </div>

            <button
              className="workspace-frame__logout"
              onClick={() => setIsLogoutConfirmOpen(true)}
              type="button"
            >
              Log out
            </button>
          </div>
        </header>

        <main className="workspace-frame__route">{children}</main>
      </div>

      {isLogoutConfirmOpen ? (
        <div
          aria-modal="true"
          className="workspace-frame__modal-backdrop"
          role="dialog"
          onClick={() => setIsLogoutConfirmOpen(false)}
        >
          <div
            className="workspace-frame__modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="workspace-frame__modal-badge">Confirm Logout</div>
            <h2>End your current workshop session?</h2>
            <p>
              You will be signed out of MechanicOS and returned to the login screen.
              Make sure any in-progress updates are already saved.
            </p>

            <div className="workspace-frame__modal-actions">
              <button
                className="workspace-frame__modal-button workspace-frame__modal-button--secondary"
                onClick={() => setIsLogoutConfirmOpen(false)}
                type="button"
              >
                Stay signed in
              </button>
              <button
                className="workspace-frame__modal-button workspace-frame__modal-button--primary"
                onClick={handleLogout}
                type="button"
              >
                Yes, log out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
