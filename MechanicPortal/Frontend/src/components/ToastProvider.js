import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import "./ToastProvider.css";

const ToastContext = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutMapRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    const timeoutId = timeoutMapRef.current.get(id);

    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutMapRef.current.delete(id);
    }

    setToasts((currentToasts) =>
      currentToasts.filter((toast) => toast.id !== id)
    );
  }, []);

  const showToast = useCallback(
    (message, type = "info", duration = 3500) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setToasts((currentToasts) => [
        ...currentToasts,
        { id, message, type },
      ]);

      const timeoutId = window.setTimeout(() => {
        removeToast(id);
      }, duration);

      timeoutMapRef.current.set(id, timeoutId);
    },
    [removeToast]
  );

  useEffect(() => {
    const timeoutMap = timeoutMapRef.current;

    return () => {
      timeoutMap.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutMap.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      success: (message, duration) => showToast(message, "success", duration),
      error: (message, duration) => showToast(message, "error", duration),
      info: (message, duration) => showToast(message, "info", duration),
      warning: (message, duration) => showToast(message, "warning", duration),
    }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.type}`}
            role={toast.type === "error" ? "alert" : "status"}
          >
            <div className="toast__indicator" aria-hidden="true"></div>
            <div className="toast__content">{toast.message}</div>
            <button
              aria-label="Dismiss notification"
              className="toast__close"
              onClick={() => removeToast(toast.id)}
              type="button"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider.");
  }

  return context;
}

export { ToastProvider, useToast };
