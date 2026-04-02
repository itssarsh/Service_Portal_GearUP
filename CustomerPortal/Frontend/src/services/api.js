import axios from "axios";
import { startGlobalLoading, stopGlobalLoading } from "../utils/loadingBridge";
import { getStoredToken } from "../utils/session";

const API = axios.create({
  baseURL: "http://localhost:5001/api/customer",
});

export const API_CALL_TYPE = {
  GET_CALL: "GET_CALL",
  POST_CALL: "POST_CALL",
  POST_CALL1: "POST_CALL1",
  PUT_CALL: "PUT_CALL",
  PATCH_CALL: "PATCH_CALL",
  DELETE_CALL: "DELETE_CALL",
};

export const USER_API = {
  signup: "/users/signup",
  login: "/users/login",
  logout: "/users/logout",
  forgotPassword: "/users/forgot-password",
  resetPassword: "/users/reset-password",
  profile: "/users/me",
  updateProfile: "/users/profile",
  changePassword: "/users/change-password",
  portalReviews: "/users/portal-reviews",
};

export const VEHICLE_API = {
  list: "/vehicles",
  create: "/vehicles",
};

export const SERVICE_RECORD_API = {
  list: "/service-records",
  create: "/service-records",
  mechanics: "/service-records/mechanics",
  details: (recordId) => `/service-records/${recordId}`,
  update: (recordId) => `/service-records/${recordId}`,
  feedback: (recordId) => `/service-records/${recordId}/feedback`,
  complaints: (recordId) => `/service-records/${recordId}/complaints`,
  invoice: (recordId) => `/service-records/${recordId}/invoice`,
};

export const CHAT_API = {
  threads: "/chat/threads",
  threadMessages: (threadId) => `/chat/threads/${threadId}/messages`,
};

export const NOTIFICATION_API = {
  list: "/notifications",
  markRead: "/notifications/read",
};

export const EXPENSE_API = {
  list: "/expenses",
  analytics: "/expenses/analytics",
  vehicleTotal: (vehicleId) => `/expenses/total/${vehicleId}`,
  vehicleMonthly: (vehicleId) => `/expenses/monthly/${vehicleId}`,
  vehicleYearly: (vehicleId) => `/expenses/yearly/${vehicleId}`,
  vehicleServiceWise: (vehicleId) => `/expenses/service-wise/${vehicleId}`,
};

export const EMERGENCY_API = {
  list: "/emergency/requests",
  create: "/emergency/requests",
};

API.interceptors.request.use((request) => {
  if (!request.skipGlobalLoader) {
    startGlobalLoading();
  }

  const token = getStoredToken();

  if (token) {
    request.headers.Authorization = `Bearer ${token}`;
  }

  return request;
}, (error) => {
  stopGlobalLoading();
  return Promise.reject(error);
});

API.interceptors.response.use((response) => {
  if (!response.config?.skipGlobalLoader) {
    stopGlobalLoading();
  }

  return response;
}, (error) => {
  if (!error.config?.skipGlobalLoader) {
    stopGlobalLoading();
  }

  return Promise.reject(error);
});

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
