import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, GET_NOTIFICATIONS_API, MARK_NOTIFICATIONS_READ_API, } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import { getAddServiceRoute, getBillingRoute, getChatRoute, getComplaintsRoute, getDashboardRoute, getEmergencyRoute, getLoginRoute, getStoredToken, } from "../../utils/session";
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
    const nextParams = new URLSearchParams();

    if (notification?.customer_id) {
      nextParams.set("customerId", String(notification.customer_id));
    }

    if (notification?.service_record_id) {
      nextParams.set("serviceRecordId", String(notification.service_record_id));
    }

    const queryString = nextParams.toString();
    return queryString ? `${getChatRoute()}?${queryString}` : getChatRoute();
  }

  if (notification?.source_type === "emergency") {
    return getEmergencyRoute();
  }

  if (notification?.source_type === "complaint") {
    return getComplaintsRoute();
  }

  if (notification?.source_type === "payment") {
    return getBillingRoute();
  }

  if (notification?.service_record_id) {
    return getAddServiceRoute(notification.service_record_id);
  }

  return getDashboardRoute();
}

function getNotificationActionLabel(notification) {
  if (notification?.source_type === "chat") {
    return "Open chat";
  }

  if (notification?.source_type === "emergency") {
    return "Open emergency";
  }

  if (notification?.source_type === "complaint") {
    return "Open complaint";
  }

  if (notification?.source_type === "payment") {
    return "Open billing";
  }

  if (notification?.service_record_id) {
    return "Open job";
  }

  return "Open";
}

export default function MechanicNotificationsPage() {
  const notificationPreviewLimit = 8;
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [isShowingAll, setIsShowingAll] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const notificationSummary = useMemo(() => {
    return notifications.reduce(
      (summary, notification) => {
        const sourceType = String(notification?.source_type || "").trim().toLowerCase();

        if (sourceType === "emergency") {
          summary.emergency += 1;
        } else if (sourceType === "chat") {
          summary.chat += 1;
        } else if (sourceType === "payment") {
          summary.payment += 1;
        } else if (sourceType === "complaint") {
          summary.complaint += 1;
        } else {
          summary.other += 1;
        }

        return summary;
      },
      {
        emergency: 0,
        chat: 0,
        payment: 0,
        complaint: 0,
        other: 0,
      }
    );
  }, [notifications]);

  const latestNotification = notifications[0] || null;
  const visibleNotifications = isShowingAll
    ? notifications
    : notifications.slice(0, notificationPreviewLimit);

  const handleNotificationsError = useCallback((error) => {
    toast.error(
      error?.response?.data?.error || "Failed to load notifications."
    );
  }, [toast]);

  const markNotificationsRead = useCallback((notificationIds) => {
    if (!notificationIds.length) {
      return Promise.resolve();
    }

    setIsMarkingRead(true);

    return makeApiCall(
      API_CALL_TYPE.PATCH_CALL,
      MARK_NOTIFICATIONS_READ_API(),
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
      GET_NOTIFICATIONS_API(),
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
            <span className="notifications-hero__badge">Notifications</span>
            <div className="notifications-hero__actions">
              <button
                className="notifications-board__button"
                type="button"
                onClick={() => void loadNotifications()}
                disabled={isLoading || isMarkingRead}
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
              <Link className="notifications-card__action" to={getDashboardRoute()}>
                Back to Dashboard
              </Link>
            </div>
          </div>

          <div className="notifications-hero__content">
            <div className="notifications-hero__intro">
              <p className="notifications-hero__eyebrow">Operational notifications</p>
              <h1>Operations inbox</h1>
              <p>All customer, billing, complaint, and emergency signals in one compact queue.</p>
            </div>

            <div className="notifications-hero__stats">
              <article className="notifications-stat">
                <span>Total activity</span>
                <strong>{notifications.length}</strong>
              </article>
              <article className="notifications-stat">
                <span>Emergency alerts</span>
                <strong>{notificationSummary.emergency}</strong>
              </article>
              <article className="notifications-stat">
                <span>Customer chats</span>
                <strong>{notificationSummary.chat}</strong>
              </article>
              <article className="notifications-stat">
                <span>Payments</span>
                <strong>{notificationSummary.payment}</strong>
              </article>
            </div>
          </div>

          <div className="notifications-hero__snapshot">
            <div className="notifications-hero__snapshot-label">Latest signal</div>
            <strong>{latestNotification?.title || "No recent alerts"}</strong>
            <span>
              {latestNotification
                ? formatNotificationTimestamp(latestNotification.created_at)
                : "New activity will appear here automatically."}
            </span>
          </div>
        </header>

        <section className="notifications-board">
          <div className="notifications-board__header">
            <div>
              <p className="notifications-board__eyebrow">Activity feed</p>
              <h2>Recent operational signals</h2>
            </div>
            <div className="notifications-board__header-actions">
              {notifications.length > notificationPreviewLimit ? (
                <button
                  className="notifications-board__button"
                  type="button"
                  onClick={() => setIsShowingAll((currentValue) => !currentValue)}
                >
                  {isShowingAll ? "Show less" : "Show all"}
                </button>
              ) : null}
            </div>
          </div>

          {notifications.length > notificationPreviewLimit ? (
            <div className="notifications-board__toolbar">
              <p>
                Showing <strong>{visibleNotifications.length}</strong> of{" "}
                <strong>{notifications.length}</strong> notifications.
              </p>
            </div>
          ) : null}

          {isLoading && notifications.length === 0 ? (
            <div className="notifications-empty">
              <div className="notifications-empty__badge">Loading</div>
              <h3>Preparing your notification feed...</h3>
              <p>Recent customer and workshop activity is being synced.</p>
            </div>
          ) : notifications.length > 0 ? (
            <div className="notifications-list">
              {visibleNotifications.map((notification) => {
                const actionRoute = getNotificationActionRoute(notification);
                const actionLabel = getNotificationActionLabel(notification);

                return (
                  <article
                    className={`notifications-card${notification.is_read ? "" : " notifications-card--unread"
                      }`}
                    key={notification.id}
                  >
                    <div className="notifications-card__top">
                      <div>
                        <p className="notifications-card__eyebrow">
                          {formatLabel(notification.source_type)}
                        </p>
                        <h3>{notification.title || "Customer update"}</h3>
                      </div>
                      <span className="notifications-card__time">
                        {formatNotificationTimestamp(notification.created_at)}
                      </span>
                    </div>

                    <p className="notifications-card__message">{notification.message}</p>

                    <div className="notifications-card__meta">
                      <span className="notifications-card__meta-pill">
                        {formatLabel(notification.source_type)}
                      </span>
                      {notification.service_type ? (
                        <span className="notifications-card__meta-pill">
                          {formatLabel(notification.service_type, "Service")}
                        </span>
                      ) : null}
                      {notification.emergency_location ? (
                        <span className="notifications-card__meta-pill">
                          {notification.emergency_location}
                        </span>
                      ) : null}
                    </div>

                    <div className="notifications-card__footer">
                      <div className="notifications-card__vehicle">
                        <span>{notification.customer_name || "Customer"}</span>
                        <strong>
                          {[notification.brand, notification.model, notification.registration_number]
                            .filter(Boolean)
                            .join(" ") || "Linked vehicle"}
                        </strong>
                      </div>

                      <Link className="notifications-card__action" to={actionRoute}>
                        {actionLabel}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="notifications-empty">
              <div className="notifications-empty__badge">Inbox clear</div>
              <h3>No active notifications right now.</h3>
              <p>New chats, payment events, complaints, and emergency signals will appear here automatically.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
