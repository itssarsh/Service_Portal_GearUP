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
  changePassword: "/users/change-password",
  profile: "/users/me",
};

export const SIGNUP_API = () => USER_API.signup;
export const LOGIN_API = () => USER_API.login;
export const LOGOUT_API = () => USER_API.logout;
export const FORGOT_PASSWORD_API = () => USER_API.forgotPassword;
export const RESET_PASSWORD_API = () => USER_API.resetPassword;
export const CHANGE_PASSWORD_API = () => USER_API.changePassword;
export const PROFILE_API = () => USER_API.profile;
export const UPDATE_PROFILE_API = () => USER_API.profile;
export const PORTAL_REVIEWS_API = () => "/users/portal-reviews";

export const VEHICLE_API = {
  list: "/vehicles",
  create: "/vehicles",
  updateNotes: (vehicleId) => `/vehicles/${vehicleId}/notes`,
};

export const GET_VEHICLES_API = () => VEHICLE_API.list;
export const CREATE_VEHICLE_API = () => VEHICLE_API.create;
export const UPDATE_VEHICLE_NOTES_API = (vehicleId) => VEHICLE_API.updateNotes(vehicleId);

export const SERVICE_RECORD_API = {
  list: "/service-records",
  create: "/service-records",
  details: (recordId) => `/service-records/${recordId}`,
  update: (recordId) => `/service-records/${recordId}`,
  updateBooking: (recordId) => `/service-records/${recordId}/booking`,
  updateComplaint: (recordId) => `/service-records/${recordId}/complaint`,
};

export const GET_SERVICE_RECORDS_API = () => SERVICE_RECORD_API.list;
export const CREATE_SERVICE_RECORD_API = () => SERVICE_RECORD_API.create;
export const GET_SERVICE_RECORD_DETAILS_API = (recordId) =>
  SERVICE_RECORD_API.details(recordId);
export const UPDATE_SERVICE_RECORD_API = (recordId) =>
  SERVICE_RECORD_API.update(recordId);
export const UPDATE_BOOKING_REQUEST_API = (recordId) =>
  SERVICE_RECORD_API.updateBooking(recordId);
export const UPDATE_COMPLAINT_ACTION_API = (recordId) =>
  SERVICE_RECORD_API.updateComplaint(recordId);

export const BILLING_API = {
  invoices: "/billing/invoices",
  autoGenerateInvoices: "/billing/invoices/auto-generate",
  updatePayment: (invoiceId) => `/billing/invoices/${invoiceId}/payment`,
  report: "/billing/report",
};

export const GET_BILLING_INVOICES_API = () => BILLING_API.invoices;
export const AUTO_GENERATE_BILLING_INVOICES_API = () =>
  BILLING_API.autoGenerateInvoices;
export const UPDATE_BILLING_PAYMENT_API = (invoiceId) =>
  BILLING_API.updatePayment(invoiceId);
export const GET_BILLING_REPORT_API = () => BILLING_API.report;

export const CHAT_API = {
  threads: "/chat/threads",
  threadMessages: (threadId) => `/chat/threads/${threadId}/messages`,
};

export const GET_CHAT_THREADS_API = () => CHAT_API.threads;
export const CREATE_CHAT_THREAD_API = () => CHAT_API.threads;
export const GET_CHAT_THREAD_MESSAGES_API = (threadId) =>
  CHAT_API.threadMessages(threadId);
export const SEND_CHAT_MESSAGE_API = (threadId) =>
  CHAT_API.threadMessages(threadId);

export const NOTIFICATION_API = {
  list: "/notifications",
  markRead: "/notifications/read",
};

export const GET_NOTIFICATIONS_API = () => NOTIFICATION_API.list;
export const MARK_NOTIFICATIONS_READ_API = () => NOTIFICATION_API.markRead;

export const EMERGENCY_API = {
  requests: "/emergency/requests",
  notifications: "/emergency/notifications",
  markNotificationsRead: "/emergency/notifications/read",
  updateStatus: (requestId) => `/emergency/requests/${requestId}/status`,
};

export const GET_EMERGENCY_REQUESTS_API = () => EMERGENCY_API.requests;
export const CREATE_EMERGENCY_REQUEST_API = () => EMERGENCY_API.requests;
export const GET_EMERGENCY_NOTIFICATIONS_API = () => EMERGENCY_API.notifications;
export const MARK_EMERGENCY_NOTIFICATIONS_READ_API = () => EMERGENCY_API.markNotificationsRead;
export const UPDATE_EMERGENCY_REQUEST_STATUS_API = (requestId) =>
  EMERGENCY_API.updateStatus(requestId);
