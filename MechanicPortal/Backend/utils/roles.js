function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function isWorkshopRole(role) {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === "mechanic" || normalizedRole === "admin";
}

module.exports = {
  normalizeRole,
  isWorkshopRole,
};
