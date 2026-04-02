import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import makeApiCall, { API_CALL_TYPE, NOTIFICATION_API } from "../services/api";
import {
  getDashboardRoute,
  getNotificationsRoute,
  getStoredToken,
} from "../utils/session";
import { useToast } from "./ToastProvider";
import "./CustomerNotificationBridge.css";

const POLLING_INTERVAL_MS = 15000;

export default function CustomerNotificationBridge() {
  const [notifications, setNotifications] = useState([]);
  const seenNotificationIdsRef = useRef(new Set());
  const currentPath = useLocation().pathname;
  const toast = useToast();

  const loadNotifications = useCallback(() => {
    if (!getStoredToken()) {
      setNotifications([]);
      return Promise.resolve([]);
    }

    return makeApiCall(
      API_CALL_TYPE.GET_CALL,
      NOTIFICATION_API.list,
      (response) => {
        const nextNotifications = Array.isArray(response) ? response : [];
        const unreadNotifications = nextNotifications.filter((notification) => !notification.is_read);

        unreadNotifications
          .slice()
          .reverse()
          .forEach((notification) => {
            if (seenNotificationIdsRef.current.has(notification.id)) {
              return;
            }

            seenNotificationIdsRef.current.add(notification.id);
            toast.info(notification.title || notification.message || "New workshop update received.", 5000);
          });

        setNotifications(unreadNotifications);
      },
      () => undefined,
      "",
      null,
      { limit: 20 },
      { skipGlobalLoader: true }
    );
  }, [toast]);

  useEffect(() => {
    void loadNotifications();

    const intervalId = window.setInterval(() => {
      void loadNotifications();
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadNotifications]);

  if (
    notifications.length === 0 ||
    currentPath === getDashboardRoute() ||
    currentPath === getNotificationsRoute()
  ) {
    return null;
  }

  const latestNotification = notifications[0];

  return (
    <Link className="customer-alert-pill" to={getNotificationsRoute()}>
      <span className="customer-alert-pill__label">
        {latestNotification?.title || "Workshop update"}
      </span>
      <span className="customer-alert-pill__count">{notifications.length}</span>
    </Link>
  );
}
