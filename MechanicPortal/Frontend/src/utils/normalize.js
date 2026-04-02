export function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function toTitleCase(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function normalizeRegistrationNumber(value) {
  return normalizeWhitespace(value).toUpperCase();
}

export function normalizePhoneNumber(value, maxLength = 10) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, maxLength);
}
