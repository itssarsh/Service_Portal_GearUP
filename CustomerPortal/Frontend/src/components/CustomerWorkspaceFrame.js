import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  clearSession,
  getAddServiceRoute,
  getAddVehicleRoute,
  getChangePasswordRoute,
  getChatRoute,
  getDashboardRoute,
  getEmergencyRoute,
  getFeedbackRoute,
  getLoginRoute,
  getNotificationsRoute,
  getProfileRoute,
  getStoredUser,
} from "../utils/session";
import "./CustomerWorkspaceFrame.css";

const hiddenShellRoutes = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]);

const navigationGroups = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard", to: getDashboardRoute(), icon: "DB" },
      { label: "Vehicles", to: getAddVehicleRoute(), icon: "VH" },
      { label: "Service Records", to: getAddServiceRoute(), icon: "SR" },
    ],
  },
  {
    label: "Engagement",
    items: [
      { label: "Chat", to: getChatRoute(), icon: "CH" },
      { label: "Notifications", to: getNotificationsRoute(), icon: "NT" },
      { label: "Feedback", to: getFeedbackRoute(), icon: "FB" },
      { label: "Emergency", to: getEmergencyRoute(), icon: "EM", tone: "danger" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Profile", to: getProfileRoute(), icon: "PF" },
      { label: "Password", to: getChangePasswordRoute(), icon: "PW" },
    ],
  },
];

function getPageMeta(pathname) {
  if (pathname.startsWith("/service-records/")) {
    return {
      eyebrow: "Service Operations",
      title: "Service booking workspace",
      description: "Manage service requests, slot planning, and workshop coordination from one customer-facing flow.",
    };
  }

  if (pathname.startsWith("/vehicles/")) {
    return {
      eyebrow: "Vehicle Registry",
      title: "Vehicle onboarding workspace",
      description: "Register customer vehicles with cleaner records so future bookings and history stay organized.",
    };
  }

  if (pathname.startsWith("/feedback/")) {
    return {
      eyebrow: "Service Feedback",
      title: "Mechanic rating desk",
      description: "Capture post-service feedback with clearer context and a more structured review flow.",
    };
  }

  if (pathname.startsWith("/complaints/")) {
    return {
      eyebrow: "Case Handling",
      title: "Complaint resolution desk",
      description: "Raise, review, and follow up on service complaints from one controlled workspace.",
    };
  }

  const pageMetaMap = {
    [getDashboardRoute()]: {
      eyebrow: "Operations Overview",
      title: "Customer control tower",
      description: "Track vehicles, bookings, spend, notifications, and workshop activity from one executive customer view.",
    },
    [getChatRoute()]: {
      eyebrow: "Workshop Communication",
      title: "Conversation desk",
      description: "Keep workshop conversations, service clarifications, and updates in one cleaner communication flow.",
    },
    [getNotificationsRoute()]: {
      eyebrow: "Live Alerts",
      title: "Notification stream",
      description: "Monitor customer alerts, workshop updates, and account activity without checking disconnected screens.",
    },
    [getFeedbackRoute()]: {
      eyebrow: "Product Signals",
      title: "Portal feedback workspace",
      description: "Share customer feedback that improves portal reliability, service visibility, and overall experience.",
    },
    [getEmergencyRoute()]: {
      eyebrow: "Rapid Response",
      title: "Emergency support board",
      description: "Raise urgent roadside requests with faster intake, clearer tracking, and stronger escalation visibility.",
    },
    [getProfileRoute()]: {
      eyebrow: "Access and Identity",
      title: "Customer profile hub",
      description: "Manage account details, linked vehicles, and service footprint from a cleaner customer profile workspace.",
    },
    [getChangePasswordRoute()]: {
      eyebrow: "Account Security",
      title: "Password and access controls",
      description: "Update access credentials without interrupting your bookings, service history, or customer activity.",
    },
    "/profile/edit": {
      eyebrow: "Account Settings",
      title: "Customer profile editor",
      description: "Keep customer details current so bookings, reminders, and workshop follow-ups stay dependable.",
    },
  };

  return pageMetaMap[pathname] || {
    eyebrow: "Customer Platform",
    title: "Customer operations suite",
    description: "A unified customer workspace for vehicles, service bookings, workshop communication, feedback, and support.",
  };
}

export default function CustomerWorkspaceFrame({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const mainScrollRef = useRef(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    setIsMobileNavOpen(false);
    mainScrollRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [location.pathname]);

  useEffect(() => {
    if (!isLogoutConfirmOpen && !isMobileNavOpen) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsLogoutConfirmOpen(false);
        setIsMobileNavOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isLogoutConfirmOpen, isMobileNavOpen]);

  if (hiddenShellRoutes.has(location.pathname)) {
    return children;
  }

  const pageMeta = getPageMeta(location.pathname);
  // const formattedDate = new Intl.DateTimeFormat("en-IN", {
  //   day: "2-digit",
  //   month: "short",
  //   year: "numeric",
  // }).format(new Date());

  const handleLogout = () => {
    clearSession();
    navigate(getLoginRoute(), { replace: true });
    setIsLogoutConfirmOpen(false);
  };

  return (
    <div className="customer-workspace">
      <button
        aria-controls="customer-workspace-sidebar"
        aria-expanded={isMobileNavOpen}
        aria-label={isMobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
        className="customer-workspace__menu-toggle"
        onClick={() => setIsMobileNavOpen((previousValue) => !previousValue)}
        type="button"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <button
        aria-hidden={!isMobileNavOpen}
        aria-label="Close navigation overlay"
        className={`customer-workspace__sidebar-overlay${
          isMobileNavOpen ? " customer-workspace__sidebar-overlay--visible" : ""
        }`}
        onClick={() => setIsMobileNavOpen(false)}
        tabIndex={isMobileNavOpen ? 0 : -1}
        type="button"
      ></button>

      <aside
        className={`customer-workspace__sidebar${isMobileNavOpen ? " customer-workspace__sidebar--open" : ""}`}
        id="customer-workspace-sidebar"
      >
        <div className="customer-workspace__sidebar-header">
          <div className="customer-workspace__brand">
            <div className="customer-workspace__brand-mark" aria-hidden="true">
              CX
            </div>
            <div>
              <strong>CustomerOS</strong>
              <span>Service and vehicle workspace</span>
            </div>
          </div>

          <button
            aria-label="Close navigation menu"
            className="customer-workspace__sidebar-close"
            onClick={() => setIsMobileNavOpen(false)}
            type="button"
          >
            Close
          </button>
        </div>

        <nav className="customer-workspace__nav" aria-label="Primary">
          {navigationGroups.map((group) => (
            <div className="customer-workspace__nav-group" key={group.label}>
              <p className="customer-workspace__nav-label">{group.label}</p>
              <div className="customer-workspace__nav-items">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    className={({ isActive }) =>
                      `customer-workspace__nav-link${isActive ? " customer-workspace__nav-link--active" : ""}${
                        item.tone === "danger" ? " customer-workspace__nav-link--danger" : ""
                      }`
                    }
                    onClick={() => setIsMobileNavOpen(false)}
                    to={item.to}
                  >
                    <span className="customer-workspace__nav-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="customer-workspace__main" ref={mainScrollRef}>
        <header className="customer-workspace__topbar">
          <div className="customer-workspace__topbar-primary">
            <div className="customer-workspace__headline">
              <span>{pageMeta.eyebrow}</span>
              <h1>{pageMeta.title}</h1>
              <p>{pageMeta.description}</p>
            </div>
          </div>

          <div className="customer-workspace__actions">
            {/* <div className="customer-workspace__date-card">
              <span>Today</span>
              <strong>{formattedDate}</strong>
            </div> */}

            <div className="customer-workspace__user-card">
              <div className="customer-workspace__user-avatar" aria-hidden="true">
                {String(currentUser?.name || "C").trim().charAt(0).toUpperCase() || "C"}
              </div>
              <div>
                <strong>{currentUser?.name || "Customer User"}</strong>
                <span>{currentUser?.role || "customer"}</span>
              </div>
            </div>

            <button
              className="customer-workspace__logout"
              onClick={() => setIsLogoutConfirmOpen(true)}
              type="button"
            >
              Log out
            </button>
          </div>
        </header>

        <main className="customer-workspace__route">{children}</main>
      </div>

      {isLogoutConfirmOpen ? (
        <div
          aria-modal="true"
          className="customer-workspace__modal-backdrop"
          role="dialog"
          onClick={() => setIsLogoutConfirmOpen(false)}
        >
          <div
            className="customer-workspace__modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="customer-workspace__modal-badge">Confirm Logout</div>
            <h2>End your current customer session?</h2>
            <p>
              You will be signed out of CustomerOS and returned to the login screen.
              Make sure any in-progress updates are already saved.
            </p>

            <div className="customer-workspace__modal-actions">
              <button
                className="customer-workspace__modal-button customer-workspace__modal-button--secondary"
                onClick={() => setIsLogoutConfirmOpen(false)}
                type="button"
              >
                Stay signed in
              </button>
              <button
                className="customer-workspace__modal-button customer-workspace__modal-button--primary"
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
