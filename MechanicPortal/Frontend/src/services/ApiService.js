import axios from "axios";
import { API_CALL_TYPE } from "./Api";
import { startGlobalLoading, stopGlobalLoading } from "../utils/loadingBridge";
import { clearSession, getLoginRoute, getStoredToken } from "../utils/session";

const API = axios.create({
  baseURL: "http://localhost:5000/api/mechanic",
});

const PUBLIC_AUTH_PATHS = [
  "/users/login",
  "/users/signup",
  "/users/forgot-password",
  "/users/reset-password",
];

const AUTH_FAILURE_MESSAGES = new Set([
  "Invalid token",
  "No token provided",
  "Mechanic portal access is required",
]);

function isPublicAuthRequest(urlPath = "") {
  return PUBLIC_AUTH_PATHS.some((publicPath) => String(urlPath).includes(publicPath));
}

function isAuthFailure(error) {
  const statusCode = error?.response?.status;
  const message = error?.response?.data?.error || error?.response?.data?.message || "";

  return (
    statusCode === 401 ||
    (statusCode === 403 && AUTH_FAILURE_MESSAGES.has(String(message).trim()))
  );
}

function redirectToLoginIfNeeded() {
  const loginRoute = getLoginRoute();

  if (window.location.pathname !== loginRoute) {
    window.location.replace(loginRoute);
  }
}

API.interceptors.request.use(
  (request) => {
    if (!request.skipGlobalLoader) {
      startGlobalLoading();
    }

    const token = getStoredToken();

    if (token) {
      request.headers.Authorization = `Bearer ${token}`;
    }

    return request;
  },
  (error) => {
    stopGlobalLoading();
    return Promise.reject(error);
  }
);

API.interceptors.response.use(
  (response) => {
    if (!response.config?.skipGlobalLoader) {
      stopGlobalLoading();
    }

    return response;
  },
  (error) => {
    if (!error.config?.skipGlobalLoader) {
      stopGlobalLoading();
    }

    if (isAuthFailure(error) && !isPublicAuthRequest(error.config?.url)) {
      clearSession();
      redirectToLoginIfNeeded();
    }

    return Promise.reject(error);
  }
);

const getRequestConfig = (token, config = {}) => {
  const headers = {
    ...(config.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return {
    ...config,
    headers,
  };
};

const handleSuccess = (response, callback) => {
  if (typeof callback === "function") {
    callback(response.data);
  }

  return response.data;
};

const handleError = (error, errorCallBack) => {
  if (typeof errorCallBack === "function") {
    errorCallBack(error);
  }

  throw error;
};

const makeGetApiCall = (urlPath, callback, errorCallBack, formData, token, body, config) => {
  const requestConfig = getRequestConfig(token, config);

  if (body && Object.keys(body).length > 0) {
    requestConfig.params = body;
  }

  return API.get(urlPath, requestConfig)
    .then((response) => handleSuccess(response, callback))
    .catch((error) => handleError(error, errorCallBack));
};

const makeDeleteApiCall = (urlPath, callback, errorCallBack, formData, token, body, config) => {
  const requestConfig = getRequestConfig(token, config);

  if (body && Object.keys(body).length > 0) {
    requestConfig.data = body;
  }

  return API.delete(urlPath, requestConfig)
    .then((response) => handleSuccess(response, callback))
    .catch((error) => handleError(error, errorCallBack));
};

const makePostApiCall = (urlPath, callback, errorCallBack, formData, token, body, config) => {
  return API.post(urlPath, formData || body, getRequestConfig(token, config))
    .then((response) => handleSuccess(response, callback))
    .catch((error) => handleError(error, errorCallBack));
};

const makePutApiCall = (urlPath, callback, errorCallBack, formData, token, body, config) => {
  return API.put(urlPath, formData || body, getRequestConfig(token, config))
    .then((response) => handleSuccess(response, callback))
    .catch((error) => handleError(error, errorCallBack));
};

const makePatchApiCall = (urlPath, callback, errorCallBack, formData, token, body, config) => {
  return API.patch(urlPath, formData || body, getRequestConfig(token, config))
    .then((response) => handleSuccess(response, callback))
    .catch((error) => handleError(error, errorCallBack));
};

export default function makeApiCall(
  apiCallType,
  urlPath,
  callback,
  errorCallBack,
  formData = "",
  token = null,
  body = {},
  config = {}
) {
  if (apiCallType === API_CALL_TYPE.GET_CALL) {
    return makeGetApiCall(urlPath, callback, errorCallBack, formData, token, body, config);
  }

  if (
    apiCallType === API_CALL_TYPE.POST_CALL ||
    apiCallType === API_CALL_TYPE.POST_CALL1
  ) {
    return makePostApiCall(urlPath, callback, errorCallBack, formData, token, body, config);
  }

  if (apiCallType === API_CALL_TYPE.PUT_CALL) {
    return makePutApiCall(urlPath, callback, errorCallBack, formData, token, body, config);
  }

  if (apiCallType === API_CALL_TYPE.PATCH_CALL) {
    return makePatchApiCall(urlPath, callback, errorCallBack, formData, token, body, config);
  }

  if (apiCallType === API_CALL_TYPE.DELETE_CALL) {
    return makeDeleteApiCall(urlPath, callback, errorCallBack, formData, token, body, config);
  }

  return Promise.reject(new Error(`Unsupported apiCallType: ${apiCallType}`));
}
