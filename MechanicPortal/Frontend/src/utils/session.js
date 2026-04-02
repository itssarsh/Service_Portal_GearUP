const SESSION_KEYS = {
  token: "mechanic_token",
  user: "mechanic_user",
};

const LEGACY_SESSION_KEYS = {
  token: "workshop_token",
  user: "workshop_user",
  fallbackToken: "token",
  fallbackUser: "user",
};

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function isMechanicRole(role) {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === "mechanic" || normalizedRole === "admin";
}

function parseStoredUser(rawUser) {
  try {
    return rawUser ? JSON.parse(rawUser) : null;
  } catch (error) {
    return null;
  }
}

function getPrimaryStoredUser() {
  return parseStoredUser(localStorage.getItem(SESSION_KEYS.user));
}

function getLegacyStoredUser() {
  const legacyMechanicUser = parseStoredUser(localStorage.getItem(LEGACY_SESSION_KEYS.user));

  if (legacyMechanicUser) {
    return legacyMechanicUser;
  }

  const legacyUser = parseStoredUser(localStorage.getItem(LEGACY_SESSION_KEYS.fallbackUser));

  return isMechanicRole(legacyUser?.role) ? legacyUser : null;
}

function getRawStoredUser() {
  return getPrimaryStoredUser() || getLegacyStoredUser();
}

function getRawStoredToken() {
  const token = localStorage.getItem(SESSION_KEYS.token);

  if (token) {
    return token;
  }

  const legacyMechanicToken = localStorage.getItem(LEGACY_SESSION_KEYS.token);

  if (legacyMechanicToken) {
    return legacyMechanicToken;
  }

  const legacyUser = parseStoredUser(localStorage.getItem(LEGACY_SESSION_KEYS.fallbackUser));
  const legacyToken = localStorage.getItem(LEGACY_SESSION_KEYS.fallbackToken);

  return isMechanicRole(legacyUser?.role) ? legacyToken || "" : "";
}

function parseTokenPayload(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const tokenParts = token.split(".");

  if (tokenParts.length < 2) {
    return null;
  }

  try {
    const normalizedPayload = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      "="
    );

    return JSON.parse(window.atob(paddedPayload));
  } catch (error) {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = parseTokenPayload(token);
  const expiresAtSeconds = Number(payload?.exp);

  if (!expiresAtSeconds) {
    return false;
  }

  return Date.now() >= expiresAtSeconds * 1000;
}

export function getStoredUser() {
  if (!getStoredToken()) {
    return null;
  }

  return getRawStoredUser();
}

export function getStoredToken() {
  const token = getRawStoredToken();
  const user = getRawStoredUser();

  if (!token) {
    return "";
  }

  if (user && !isMechanicRole(user.role)) {
    clearSession();
    return "";
  }

  if (isTokenExpired(token)) {
    clearSession();
    return "";
  }

  return token;
}

export function storeSession(token, user) {
  localStorage.setItem(SESSION_KEYS.token, token);
  localStorage.setItem(SESSION_KEYS.user, JSON.stringify(user));
  localStorage.removeItem("workshop_token");
  localStorage.removeItem("workshop_user");
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEYS.token);
  localStorage.removeItem(SESSION_KEYS.user);
  localStorage.removeItem(LEGACY_SESSION_KEYS.token);
  localStorage.removeItem(LEGACY_SESSION_KEYS.user);
  localStorage.removeItem(LEGACY_SESSION_KEYS.fallbackToken);
  localStorage.removeItem(LEGACY_SESSION_KEYS.fallbackUser);
}

export function getDashboardRoute() {
  return "/workshop/dashboard";
}

export function getLoginRoute() {
  return "/workshop/login";
}

export function getForgotPasswordRoute() {
  return "/workshop/forgot-password";
}

export function getResetPasswordRoute() {
  return "/workshop/reset-password";
}

export function getChangePasswordRoute() {
  return "/workshop/change-password";
}

export function getProfileRoute() {
  return "/workshop/profile";
}

export function getFeedbackRoute() {
  return "/workshop/feedback";
}

export function getBillingRoute() {
  return "/workshop/billing";
}

export function getChatRoute() {
  return "/workshop/chat";
}

export function getEmergencyRoute() {
  return "/workshop/emergency";
}

export function getNotificationsRoute() {
  return "/workshop/notifications";
}

export function getComplaintsRoute() {
  return "/workshop/complaints";
}

export function getAddVehicleRoute() {
  return "/workshop/vehicles/new";
}

export function getAddServiceRoute(recordId) {
  return recordId
    ? `/workshop/service-records/${recordId}/edit`
    : "/workshop/service-records/new";
}

export { isMechanicRole, normalizeRole };
