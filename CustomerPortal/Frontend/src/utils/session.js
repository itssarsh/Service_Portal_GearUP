const SESSION_KEYS = {
  token: "customer_token",
  user: "customer_user",
  expiresAt: "customer_token_expires_at",
};

function parseStoredUser(rawUser) {
  try {
    return rawUser ? JSON.parse(rawUser) : null;
  } catch (error) {
    return null;
  }
}

function normalizeSessionUser(user) {
  if (!user) {
    return null;
  }

  return {
    ...user,
    role: String(user.role || "").trim().toLowerCase(),
  };
}

function getStoredExpiryValue() {
  const expiryValue = localStorage.getItem(SESSION_KEYS.expiresAt);
  const parsedValue = Number(expiryValue);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function isSessionExpired() {
  const expiresAt = getStoredExpiryValue();

  return Boolean(expiresAt && Date.now() >= expiresAt);
}

export function isAuthError(error) {
  const status = error?.response?.status;

  return status === 401 || status === 403;
}

export function getStoredUser() {
  if (isSessionExpired()) {
    clearSession();
    return null;
  }

  const user = parseStoredUser(localStorage.getItem(SESSION_KEYS.user));

  if (user) {
    return normalizeSessionUser(user);
  }

  const legacyUser = parseStoredUser(localStorage.getItem("user"));

  return String(legacyUser?.role || "").trim().toLowerCase() === "customer"
    ? normalizeSessionUser(legacyUser)
    : null;
}

export function getStoredToken() {
  if (isSessionExpired()) {
    clearSession();
    return "";
  }

  const token = localStorage.getItem(SESSION_KEYS.token);

  if (token) {
    return token;
  }

  const legacyUser = parseStoredUser(localStorage.getItem("user"));
  const legacyToken = localStorage.getItem("token");

  return String(legacyUser?.role || "").trim().toLowerCase() === "customer"
    ? legacyToken || ""
    : "";
}

export function hasCustomerSession() {
  return Boolean(getStoredToken() && getStoredUser()?.role === "customer");
}

export function storeSession(token, user, expiresAt = getStoredExpiryValue()) {
  localStorage.setItem(SESSION_KEYS.token, token);
  localStorage.setItem(SESSION_KEYS.user, JSON.stringify(normalizeSessionUser(user)));
  if (expiresAt) {
    localStorage.setItem(SESSION_KEYS.expiresAt, String(expiresAt));
  } else {
    localStorage.removeItem(SESSION_KEYS.expiresAt);
  }
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEYS.token);
  localStorage.removeItem(SESSION_KEYS.user);
  localStorage.removeItem(SESSION_KEYS.expiresAt);
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function getDashboardRoute() {
  return "/dashboard";
}

export function getLoginRoute() {
  return "/";
}

export function getForgotPasswordRoute() {
  return "/forgot-password";
}

export function getResetPasswordRoute() {
  return "/reset-password";
}

export function getProfileRoute() {
  return "/profile";
}

export function getAddVehicleRoute() {
  return "/vehicles/new";
}

export function getAddServiceRoute(recordId) {
  return recordId
    ? `/service-records/${recordId}/edit`
    : "/service-records/new";
}

export function getEditProfileRoute() {
  return "/profile/edit";
}

export function getChangePasswordRoute() {
  return "/change-password";
}

export function getEmergencyRoute() {
  return "/emergency";
}

export function getChatRoute() {
  return "/chat";
}

export function getNotificationsRoute() {
  return "/notifications";
}

export function getFeedbackRoute(recordId) {
  return recordId ? `/feedback/${recordId}` : "/feedback";
}

export function getComplaintRoute(recordId) {
  return recordId ? `/complaints/${recordId}` : "/dashboard";
}
