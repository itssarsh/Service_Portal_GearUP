import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  API_CALL_TYPE,
  GET_EMERGENCY_NOTIFICATIONS_API,
  MARK_EMERGENCY_NOTIFICATIONS_READ_API,
} from "../services/Api";
import makeApiCall from "../services/ApiService";
import { useToast } from "./ToastProvider";
import { getEmergencyRoute, getStoredToken } from "../utils/session";

const POLLING_INTERVAL_MS = 15000;

export default function EmergencyNotificationBridge() {
  const [notifications, setNotifications] = useState([]);
  const seenNotificationIdsRef = useRef(new Set());
  const currentPath = useLocation().pathname;
  const toast = useToast();

  const markNotificationsRead = useCallback((notificationIds) => {
    if (!notificationIds.length) {
      return Promise.resolve();
    }

    return makeApiCall(
      API_CALL_TYPE.PATCH_CALL,
      MARK_EMERGENCY_NOTIFICATIONS_READ_API(),
      () => undefined,
      () => undefined,
      "",
      null,
      { notificationIds },
      { skipGlobalLoader: true }
    ).catch(() => undefined);
  }, []);

  const loadNotifications = useCallback(() => {
    if (!getStoredToken()) {
      setNotifications([]);
      return Promise.resolve([]);
    }

    return makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_EMERGENCY_NOTIFICATIONS_API(),
      (response) => {
        const nextNotifications = response || [];

        nextNotifications
          .slice()
          .reverse()
          .forEach((notification) => {
            if (seenNotificationIdsRef.current.has(notification.id)) {
              return;
            }

            seenNotificationIdsRef.current.add(notification.id);

            const vehicleLabel = [
              notification.brand,
              notification.model,
              notification.registration_number,
            ]
              .filter(Boolean)
              .join(" ");

            toast.warning(
              `New SOS near ${notification.emergency_location || "your area"}${
                vehicleLabel ? ` for ${vehicleLabel}` : ""
              }.`,
              5000
            );
          });

        setNotifications(nextNotifications);
      },
      () => undefined,
      "",
      null,
      {},
      { skipGlobalLoader: true }
    );
  }, [toast]);

  useEffect(() => {
    let isCancelled = false;

    const pollNotifications = () =>
      loadNotifications()
        .then((response) => {
          if (isCancelled) {
            return;
          }

          if (currentPath === getEmergencyRoute()) {
            const nextNotifications = response || [];

            if (nextNotifications.length > 0) {
              void markNotificationsRead(nextNotifications.map((notification) => notification.id));
              setNotifications([]);
            }
          }
        })
        .catch(() => []);

    void pollNotifications();

    const intervalId = window.setInterval(() => {
      void pollNotifications();
    }, POLLING_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentPath, loadNotifications, markNotificationsRead]);

  if (notifications.length === 0 || currentPath === getEmergencyRoute()) {
    return null;
  }

  return (
    <Link className="emergency-alert-pill" to={getEmergencyRoute()}>
      <span className="emergency-alert-pill__label">New SOS Alerts</span>
      <span className="emergency-alert-pill__count">{notifications.length}</span>
    </Link>
  );
}
