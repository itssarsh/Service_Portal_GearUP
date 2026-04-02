export function getDateValue(value) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  parsedDate.setHours(0, 0, 0, 0);
  return parsedDate;
}

export function formatDisplayDate(value, fallback = "Not set") {
  const parsedDate = getDateValue(value);

  if (!parsedDate) {
    return fallback;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

export function formatDateTime(value, fallback = "Not set") {
  if (!value) {
    return fallback;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

export function formatCurrencyInr(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatStatusLabel(value, fallback = "Not started") {
  if (!value) {
    return fallback;
  }

  return String(value)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatVehicleTypeLabel(value, fallback = "Vehicle") {
  if (!value) {
    return fallback;
  }

  const normalizedValue = String(value).trim().toLowerCase();
  return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}

export function formatTransportOptionLabel(value, fallback = "Self Drop-Off") {
  if (!value) {
    return fallback;
  }

  if (value === "pickup_drop") {
    return "Pickup & Drop";
  }

  if (value === "drop_off") {
    return "Self Drop-Off";
  }

  return fallback;
}

export function formatExpenseServiceTypeLabel(value, fallback = "Other") {
  if (!value) {
    return fallback;
  }

  return String(value)
    .trim()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function formatComplaintStatusLabel(value, fallback = "Open") {
  if (!value) {
    return fallback;
  }

  return String(value)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
