import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import {
  API_CALL_TYPE,
  CREATE_EMERGENCY_REQUEST_API,
  GET_EMERGENCY_REQUESTS_API,
  UPDATE_EMERGENCY_REQUEST_STATUS_API,
} from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import { showApiError } from "../../utils/apiError";
import {
  getDashboardRoute,
  getLoginRoute,
  getStoredToken,
} from "../../utils/session";
import { formatDisplayDate, formatDisplayTime, formatStatusLabel } from "../../utils/formatters";
import "./Emergency.css";

const initialForm = {
  registrationNumber: "",
  vehicleType: "car",
  brand: "",
  model: "",
  ownerName: "",
  ownerPhone: "",
  emergencyLocation: "",
  complaint: "",
  emergencyPriority: "critical",
  transportOption: "pickup_drop",
  estimatedHours: "2",
};

const vehicleTypeOptions = [
  { value: "car", label: "Car" },
  { value: "bike", label: "Bike" },
  { value: "truck", label: "Truck" },
  { value: "tractor", label: "Tractor" },
  { value: "other", label: "Other" },
];

const emergencyPriorityOptions = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const emergencyStatusActions = [
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "Start Work" },
  { value: "resolved", label: "Resolve" },
  { value: "cancelled", label: "Cancel" },
];

export default function MechanicEmergencyPage() {
  const requestPreviewLimit = 4;
  const [form, setForm] = useState(initialForm);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingRequestIds, setUpdatingRequestIds] = useState({});
  const [isShowingAll, setIsShowingAll] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const loadEmergencyRequests = useCallback(
    () =>
      makeApiCall(
        API_CALL_TYPE.GET_CALL,
        GET_EMERGENCY_REQUESTS_API(),
        (response) => setRequests(response || []),
        (error) => showApiError(toast, error, "Failed to load SOS requests."),
        "",
        null,
        {}
      ),
    [toast]
  );

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    setIsLoading(true);

    loadEmergencyRequests()
      .catch(() => undefined)
      .finally(() => setIsLoading(false));

    const intervalId = window.setInterval(() => {
      void loadEmergencyRequests();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadEmergencyRequests, navigate]);

  const summary = useMemo(() => {
    const activeRequests = requests.filter(
      (request) => request.emergency_status !== "resolved" && request.emergency_status !== "cancelled"
    );

    return {
      total: requests.length,
      active: activeRequests.length,
      critical: requests.filter((request) => request.emergency_priority === "critical").length,
      resolved: requests.filter((request) => request.emergency_status === "resolved").length,
    };
  }, [requests]);
  const latestActiveRequest =
    requests.find(
      (request) => request.emergency_status !== "resolved" && request.emergency_status !== "cancelled"
    ) || requests[0] || null;
  const visibleRequests = isShowingAll ? requests : requests.slice(0, requestPreviewLimit);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previousForm) => ({ ...previousForm, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    setIsSubmitting(true);

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      CREATE_EMERGENCY_REQUEST_API(),
      (response) => {
        toast.success(
          `SOS request raised and assigned to ${response?.mechanic_name || "nearby mechanic"}.`
        );
        setRequests((previousRequests) => [response, ...previousRequests]);
        setForm(initialForm);
      },
      (error) => showApiError(toast, error, "Failed to raise SOS request."),
      "",
      null,
      {
        ...form,
        registrationNumber: form.registrationNumber.toUpperCase(),
      }
    )
      .catch(() => undefined)
      .finally(() => setIsSubmitting(false));
  };

  const handleStatusUpdate = (requestId, emergencyStatus) => {
    setUpdatingRequestIds((previousIds) => ({
      ...previousIds,
      [requestId]: true,
    }));

    makeApiCall(
      API_CALL_TYPE.PATCH_CALL,
      UPDATE_EMERGENCY_REQUEST_STATUS_API(requestId),
      (response) => {
        setRequests((previousRequests) =>
          previousRequests.map((request) => (request.id === requestId ? response : request))
        );
        toast.success(`SOS request marked as ${formatStatusLabel(emergencyStatus)}.`);
      },
      (error) => showApiError(toast, error, "Failed to update SOS status."),
      "",
      null,
      { emergencyStatus }
    )
      .catch(() => undefined)
      .finally(() => {
        setUpdatingRequestIds((previousIds) => ({
          ...previousIds,
          [requestId]: false,
        }));
      });
  };

  return (
    <section className="emergency-page">
      <div className="emergency-page__backdrop"></div>

      <div className="emergency-shell">
        <header className="emergency-hero">
          <div className="emergency-hero__content">
            <p className="emergency-hero__eyebrow">Emergency operations</p>
            <h1>SOS command center</h1>
            <p className="emergency-hero__copy">
              Raise roadside cases fast and manage live dispatch status from one emergency board.
            </p>

            <div className="emergency-hero__actions">
              <Link className="emergency-hero__secondary" to={getDashboardRoute()}>
                Back to Dashboard
              </Link>
              <button
                className="emergency-hero__button"
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  loadEmergencyRequests()
                    .catch(() => undefined)
                    .finally(() => setIsLoading(false));
                }}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="emergency-hero__aside">
            <div className="emergency-hero__stats">
              <article className="emergency-stat">
                <span>Total SOS</span>
                <strong>{summary.total}</strong>
              </article>
              <article className="emergency-stat">
                <span>Active</span>
                <strong>{summary.active}</strong>
              </article>
              <article className="emergency-stat">
                <span>Critical</span>
                <strong>{summary.critical}</strong>
              </article>
              <article className="emergency-stat">
                <span>Resolved</span>
                <strong>{summary.resolved}</strong>
              </article>
            </div>

            <div className="emergency-hero__snapshot">
              <span className="emergency-hero__snapshot-label">Live priority case</span>
              <strong>
                {latestActiveRequest
                  ? `${latestActiveRequest.brand || "Vehicle"} ${latestActiveRequest.model || ""}`.trim()
                  : "No active SOS requests"}
              </strong>
              <span>
                {latestActiveRequest?.emergency_location || "New emergency requests will appear here automatically."}
              </span>
            </div>
          </div>
        </header>

        <div className="emergency-layout">
          <form className="emergency-form" onSubmit={handleSubmit}>
            <div className="emergency-form__header">
              <h2>Raise SOS request</h2>
              <p>Location and issue details are mandatory. Remaining fields help dispatch faster.</p>
            </div>

            <div className="emergency-form__grid">
              <label className="emergency-field">
                <span>Registration Number</span>
                <input
                  name="registrationNumber"
                  onChange={handleChange}
                  placeholder="GJ01AB1234"
                  value={form.registrationNumber}
                />
              </label>

              <label className="emergency-field">
                <span>Vehicle Type</span>
                <select name="vehicleType" onChange={handleChange} value={form.vehicleType}>
                  {vehicleTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="emergency-field">
                <span>Brand</span>
                <input name="brand" onChange={handleChange} placeholder="Maruti / Honda" value={form.brand} />
              </label>

              <label className="emergency-field">
                <span>Model</span>
                <input name="model" onChange={handleChange} placeholder="Swift / Activa" value={form.model} />
              </label>

              <label className="emergency-field">
                <span>Owner Name</span>
                <input name="ownerName" onChange={handleChange} placeholder="Customer name" value={form.ownerName} />
              </label>

              <label className="emergency-field">
                <span>Owner Phone</span>
                <input name="ownerPhone" onChange={handleChange} placeholder="9876543210" value={form.ownerPhone} />
              </label>

              <label className="emergency-field emergency-field--full">
                <span>Emergency Location</span>
                <textarea
                  name="emergencyLocation"
                  onChange={handleChange}
                  placeholder="Flat / road / area / city / pincode"
                  rows={3}
                  value={form.emergencyLocation}
                />
              </label>

              <label className="emergency-field emergency-field--full">
                <span>Issue Details</span>
                <textarea
                  name="complaint"
                  onChange={handleChange}
                  placeholder="Breakdown, puncture, no-start, engine smoke..."
                  rows={4}
                  value={form.complaint}
                />
              </label>

              <label className="emergency-field">
                <span>Priority</span>
                <select name="emergencyPriority" onChange={handleChange} value={form.emergencyPriority}>
                  {emergencyPriorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="emergency-field">
                <span>Transport</span>
                <select name="transportOption" onChange={handleChange} value={form.transportOption}>
                  <option value="pickup_drop">Pickup + Drop</option>
                  <option value="drop_off">Drop Off</option>
                </select>
              </label>

              <label className="emergency-field">
                <span>Estimated Hours</span>
                <input
                  min="1"
                  name="estimatedHours"
                  onChange={handleChange}
                  type="number"
                  value={form.estimatedHours}
                />
              </label>
            </div>

            <button className="emergency-form__submit" type="submit">
              {isSubmitting ? "Raising SOS..." : "Raise SOS Request"}
            </button>
          </form>

          <section className="emergency-board">
            <div className="emergency-board__header">
              <div>
                <p className="emergency-board__eyebrow">Live queue</p>
                <h2>Emergency board</h2>
              </div>
              {requests.length > requestPreviewLimit ? (
                <button
                  className="emergency-hero__secondary emergency-hero__secondary--button"
                  type="button"
                  onClick={() => setIsShowingAll((currentValue) => !currentValue)}
                >
                  {isShowingAll ? "Show less" : "Show all"}
                </button>
              ) : null}
            </div>

            {requests.length > requestPreviewLimit ? (
              <div className="emergency-board__toolbar">
                <p>
                  Showing <strong>{visibleRequests.length}</strong> of <strong>{requests.length}</strong> SOS requests.
                </p>
              </div>
            ) : null}

            <div className="emergency-board__list">
              {isLoading ? (
                <div className="emergency-empty">Loading SOS requests...</div>
              ) : requests.length > 0 ? (
                visibleRequests.map((request) => (
                  <article className="emergency-card" key={request.id}>
                    <div className="emergency-card__top">
                      <div>
                        <h3>{request.brand} {request.model}</h3>
                        <p>{request.registration_number} · {request.owner_name}</p>
                      </div>
                      <div className="emergency-card__badges">
                        <span className="emergency-card__badge emergency-card__badge--priority">
                          {formatStatusLabel(request.emergency_priority)}
                        </span>
                        <span className="emergency-card__badge">
                          {formatStatusLabel(request.emergency_status)}
                        </span>
                      </div>
                    </div>

                    <div className="emergency-card__meta">
                      <div>
                        <span>Assigned mechanic</span>
                        <strong>{request.mechanic_name || "Not assigned"}</strong>
                      </div>
                      <div>
                        <span>Raised on</span>
                        <strong>{formatDisplayDate(request.emergency_requested_at)}</strong>
                      </div>
                      <div>
                        <span>Slot</span>
                        <strong>{formatDisplayTime(request.booking_time_slot, "Immediate")}</strong>
                      </div>
                    </div>

                    <div className="emergency-card__section">
                      <span>Location</span>
                      <p>{request.emergency_location || "Location not available"}</p>
                    </div>

                    <div className="emergency-card__section">
                      <span>Issue</span>
                      <p>{request.complaint || "No issue details shared."}</p>
                    </div>

                    <div className="emergency-card__actions">
                      {emergencyStatusActions.map((action) => (
                        <button
                          disabled={Boolean(updatingRequestIds[request.id])}
                          key={action.value}
                          onClick={() => handleStatusUpdate(request.id, action.value)}
                          type="button"
                        >
                          {updatingRequestIds[request.id] ? "Updating..." : action.label}
                        </button>
                      ))}
                    </div>
                  </article>
                ))
              ) : (
                <div className="emergency-empty">
                  No SOS requests yet. Raise a request to start live dispatch tracking.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
