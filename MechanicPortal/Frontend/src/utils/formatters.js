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

export function formatDisplayTime(value, fallback = "Not set") {
  if (!value) {
    return fallback;
  }

  if (typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    const [hoursValue, minutesValue] = value.split(":");
    const hours = Number(hoursValue);
    const minutes = Number(minutesValue);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return fallback;
    }

    const timeDate = new Date();
    timeDate.setHours(hours, minutes, 0, 0);

    return new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    }).format(timeDate);
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat("en-IN", {
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

export function formatComplaintStatusLabel(value, fallback = "Open") {
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
