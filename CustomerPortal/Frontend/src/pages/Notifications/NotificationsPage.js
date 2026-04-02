import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, NOTIFICATION_API } from "../../services/api";
import {
  clearSession,
  getChatRoute,
  getComplaintRoute,
  getDashboardRoute,
  getEmergencyRoute,
  getLoginRoute,
  getStoredToken,
  isAuthError,
} from "../../utils/session";
import "./Notifications.css";

function formatLabel(value, fallback = "Update") {
  if (!value) {
    return fallback;
  }

  return String(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatNotificationTimestamp(value) {
  if (!value) {
    return "Just now";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Just now";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
}

function getNotificationActionRoute(notification) {
  if (notification?.source_type === "chat") {
    if (notification?.service_record_id) {
      return `${getChatRoute()}?${new URLSearchParams({
        serviceRecordId: String(notification.service_record_id),
      }).toString()}`;
    }

    return getChatRoute();
  }

  if (notification?.source_type === "complaint" && notification?.service_record_id) {
    return getComplaintRoute(notification.service_record_id);
  }

  if (notification?.source_type === "emergency") {
    return getEmergencyRoute();
  }

  return `${getDashboardRoute()}#dashboard-bookings-history`;
}

export default function CustomerNotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.is_read),
    [notifications]
  );

  const handleNotificationsError = useCallback((error) => {
    if (isAuthError(error)) {
      toast.error(error.response?.data?.error || "Please login again.");
      clearSession();
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    toast.error(error.response?.data?.error || "Failed to load notifications.");
  }, [navigate, toast]);

  const markNotificationsRead = useCallback((notificationIds) => {
    if (!notificationIds.length) {
      return Promise.resolve();
    }

    setIsMarkingRead(true);

    return makeApiCall(
      API_CALL_TYPE.PATCH_CALL,
      NOTIFICATION_API.markRead,
      () => {
        setNotifications((currentNotifications) =>
          currentNotifications.map((notification) =>
            notificationIds.includes(notification.id)
              ? { ...notification, is_read: true }
              : notification
          )
        );
        setIsMarkingRead(false);
      },
      (error) => {
        setIsMarkingRead(false);
        handleNotificationsError(error);
      },
      "",
      null,
      { notificationIds },
      { skipGlobalLoader: true }
    ).catch(() => undefined);
  }, [handleNotificationsError]);

  const loadNotifications = useCallback(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return Promise.resolve();
    }

    setIsLoading(true);

    return makeApiCall(
      API_CALL_TYPE.GET_CALL,
      NOTIFICATION_API.list,
      (response) => {
        const nextNotifications = Array.isArray(response) ? response : [];
        setNotifications(nextNotifications);
        setIsLoading(false);

        const nextUnreadIds = nextNotifications
          .filter((notification) => !notification.is_read)
          .map((notification) => notification.id);

        if (nextUnreadIds.length > 0) {
          void markNotificationsRead(nextUnreadIds);
        }
      },
      (error) => {
        setIsLoading(false);
        handleNotificationsError(error);
      },
      "",
      null,
      { limit: 100 },
      { skipGlobalLoader: true }
    ).catch(() => undefined);
  }, [handleNotificationsError, markNotificationsRead, navigate]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  return (
    <section className="notifications-page">
      <div className="notifications-page__backdrop"></div>

      <div className="notifications-shell">
        <header className="notifications-hero">
          <div className="notifications-hero__top">
            <Link className="notifications-hero__back" to={getDashboardRoute()}>
              Back to Dashboard
            </Link>
            <span className="notifications-hero__badge">Notifications</span>
          </div>

          <div className="notifications-hero__content">
            <div>
              <p className="notifications-hero__eyebrow">Operational Alerts</p>
              <h1>See every workshop action, support update, and service alert linked to your account.</h1>
              <p>
                Booking updates, SOS changes, complaint actions, and workshop communication all appear in one place.
              </p>
            </div>

            <div className="notifications-hero__stats">
              <article className="notifications-stat">
                <span>Total notifications</span>
                <strong>{notifications.length}</strong>
              </article>
              <article className="notifications-stat">
                <span>Unread now</span>
                <strong>{unreadNotifications.length}</strong>
              </article>
            </div>
          </div>
        </header>

        <section className="notifications-board">
          <div className="notifications-board__header">
            <div>
              <p className="notifications-board__eyebrow">Activity Feed</p>
              <h2>Recent operational alerts</h2>
            </div>
            <button
              className="notifications-board__button"
              type="button"
              onClick={() => void loadNotifications()}
              disabled={isLoading || isMarkingRead}
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {notifications.length > 0 ? (
            <div className="notifications-list">
              {notifications.map((notification) => {
                const actionRoute = getNotificationActionRoute(notification);

                return (
                  <article
                    className={`notifications-card${
                      notification.is_read ? "" : " notifications-card--unread"
                    }`}
                    key={notification.id}
                  >
                    <div className="notifications-card__top">
                      <div>
                        <p className="notifications-card__eyebrow">
                          {formatLabel(notification.source_type)}
                        </p>
                        <h3>{notification.title || "Workshop update"}</h3>
                      </div>
                      <span className="notifications-card__time">
                        {formatNotificationTimestamp(notification.created_at)}
                      </span>
                    </div>

                    <p className="notifications-card__message">{notification.message}</p>

                    <div className="notifications-card__footer">
                      <div className="notifications-card__vehicle">
                        <span>{notification.registration_number || "Vehicle linked"}</span>
                        <strong>
                          {[notification.brand, notification.model].filter(Boolean).join(" ") || "Customer vehicle"}
                        </strong>
                      </div>

                      <Link className="notifications-card__action" to={actionRoute}>
                        Open
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
              <div className="notifications-empty">
                <div className="notifications-empty__badge">No notifications yet</div>
              <h3>Workshop and support updates will appear here automatically.</h3>
              <p>
                Once the workshop updates booking, SOS, or sends a message, this screen will start filling up.
              </p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
