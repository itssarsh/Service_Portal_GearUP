import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { registerLoaderHandlers } from "../utils/loadingBridge";
import "./LoadingProvider.css";

const LoadingContext = createContext(null);
const MIN_VISIBLE_LOADER_MS = 450;

function LoadingProvider({ children }) {
  const [activeLoaders, setActiveLoaders] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const shownAtRef = useRef(0);
  const hideTimerRef = useRef(null);

  const show = useCallback(() => {
    setActiveLoaders((currentCount) => currentCount + 1);
  }, []);

  const hide = useCallback(() => {
    setActiveLoaders((currentCount) => Math.max(0, currentCount - 1));
  }, []);

  useLayoutEffect(() => {
    registerLoaderHandlers({ show, hide });

    return () => {
      registerLoaderHandlers(null);
    };
  }, [hide, show]);

  useEffect(() => {
    if (activeLoaders > 0) {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      if (!isVisible) {
        shownAtRef.current = Date.now();
        setIsVisible(true);
      }

      return undefined;
    }

    if (!isVisible) {
      return undefined;
    }

    const elapsed = Date.now() - shownAtRef.current;
    const remaining = Math.max(MIN_VISIBLE_LOADER_MS - elapsed, 0);

    hideTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      hideTimerRef.current = null;
    }, remaining);

    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [activeLoaders, isVisible]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      isLoading: activeLoaders > 0 || isVisible,
      show,
      hide,
    }),
    [activeLoaders, hide, isVisible, show]
  );

  return (
    <LoadingContext.Provider value={value}>
      {children}

      {isVisible && (
        <div className="global-loader" aria-live="assertive" aria-busy="true">
          <div className="global-loader__backdrop"></div>
          {/* <div className="global-loader__panel"> */}
            <div className="global-loader__spinner" aria-hidden="true"></div>
            {/* <strong>Loading</strong> */}
            {/* <span>Please wait while we prepare your latest vehicle and service data.</span> */}
          </div>
      )}
    </LoadingContext.Provider>
  );
}

function useGlobalLoader() {
  const context = useContext(LoadingContext);

  if (!context) {
    throw new Error("useGlobalLoader must be used within a LoadingProvider.");
  }

  return context;
}

export { LoadingProvider, useGlobalLoader };
