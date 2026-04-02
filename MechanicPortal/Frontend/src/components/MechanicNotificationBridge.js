import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  API_CALL_TYPE,
  GET_NOTIFICATIONS_API,
} from "../services/Api";
import makeApiCall from "../services/ApiService";
import {
  getNotificationsRoute,
  getStoredToken,
} from "../utils/session";
import { useToast } from "./ToastProvider";

const POLLING_INTERVAL_MS = 15000;

export default function MechanicNotificationBridge() {
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
      GET_NOTIFICATIONS_API(),
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
            toast.info(
              notification.title || notification.message || "New customer activity received.",
              5000
            );
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
    void loadNotifications().catch(() => []);

    const intervalId = window.setInterval(() => {
      void loadNotifications().catch(() => []);
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadNotifications]);

  if (notifications.length === 0 || currentPath === getNotificationsRoute()) {
    return null;
  }

  const latestNotification = notifications[0];

  return (
    <Link className="mechanic-alert-pill" to={getNotificationsRoute()}>
      <span className="mechanic-alert-pill__label">
        {latestNotification?.title || "Customer activity"}
      </span>
      <span className="mechanic-alert-pill__count">{notifications.length}</span>
    </Link>
  );
}
