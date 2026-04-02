function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function toTitleCase(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizePhoneNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeRegistrationNumber(value) {
  return normalizeWhitespace(value).toUpperCase();
}

module.exports = {
  normalizeWhitespace,
  toTitleCase,
  normalizePhoneNumber,
  normalizeRegistrationNumber,
};
