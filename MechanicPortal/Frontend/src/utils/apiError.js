export function getApiErrorMessage(error, fallbackMessage = "Something went wrong.") {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    fallbackMessage
  );
}

export function showApiError(toast, error, fallbackMessage) {
  toast.error(getApiErrorMessage(error, fallbackMessage));
}
