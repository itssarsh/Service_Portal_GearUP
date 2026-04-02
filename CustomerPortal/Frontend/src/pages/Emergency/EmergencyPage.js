import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, EMERGENCY_API, VEHICLE_API } from "../../services/api";
import {
  clearSession,
  getAddVehicleRoute,
  getDashboardRoute,
  getLoginRoute,
  getStoredToken,
  isAuthError,
} from "../../utils/session";
import {
  formatDisplayDate,
  formatStatusLabel,
  formatTransportOptionLabel,
  formatVehicleTypeLabel,
} from "../../utils/formatters";
import "./Emergency.css";

const emergencyPriorityOptions = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const transportOptions = [
  { value: "pickup_drop", label: "Pickup & Drop" },
  { value: "drop_off", label: "Self Drop-Off" },
];

export default function CustomerEmergencyPage() {
  const [vehicles, setVehicles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({
    vehicleId: "",
    emergencyLocation: "",
    complaint: "",
    emergencyPriority: "critical",
    transportOption: "pickup_drop",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    const handleEmergencyError = (error) => {
      if (isAuthError(error)) {
        toast.error(error.response?.data?.error || "Please login again.");
        clearSession();
        navigate(getLoginRoute(), { replace: true });
        return;
      }

      toast.error(error.response?.data?.error || "Failed to load SOS details.");
    };

    Promise.all([
      makeApiCall(
        API_CALL_TYPE.GET_CALL,
        VEHICLE_API.list,
        (response) => {
          const nextVehicles = response || [];
          setVehicles(nextVehicles);
          if (nextVehicles.length > 0) {
            setForm((previousForm) => ({
              ...previousForm,
              vehicleId: previousForm.vehicleId || String(nextVehicles[0].id),
            }));
          }
        },
        handleEmergencyError,
        "",
        null,
        {}
      ),
      makeApiCall(
        API_CALL_TYPE.GET_CALL,
        EMERGENCY_API.list,
        (response) => setRequests(response || []),
        handleEmergencyError,
        "",
        null,
        {}
      ),
    ])
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, [navigate, toast]);

  const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === String(form.vehicleId));
  const summary = useMemo(() => {
    const activeRequests = requests.filter(
      (request) => !["resolved", "cancelled"].includes(String(request.emergency_status || "").toLowerCase())
    );

    return {
      total: requests.length,
      active: activeRequests.length,
      critical: requests.filter((request) => request.emergency_priority === "critical").length,
      latest: requests[0]?.emergency_requested_at || requests[0]?.created_at || null,
    };
  }, [requests]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previousForm) => ({
      ...previousForm,
      [name]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.vehicleId) {
      toast.error("Please choose a vehicle for SOS request.");
      return;
    }

    if (!form.emergencyLocation.trim() || !form.complaint.trim()) {
      toast.error("Location and issue details are required for SOS request.");
      return;
    }

    setIsSubmitting(true);

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      EMERGENCY_API.create,
      (response) => {
        toast.success(
          response?.mechanic_name
            ? `SOS request raised and assigned to ${response.mechanic_name}.`
            : "SOS request raised and nearby mechanics notified."
        );
        setRequests((previousRequests) => [response, ...previousRequests]);
        setForm((previousForm) => ({
          ...previousForm,
          emergencyLocation: "",
          complaint: "",
          emergencyPriority: "critical",
          transportOption: "pickup_drop",
        }));
      },
      (error) => {
        toast.error(error.response?.data?.error || "Failed to raise SOS request.");
      },
      "",
      null,
      {
        ...form,
        vehicleId: Number(form.vehicleId),
      }
    )
      .catch(() => undefined)
      .finally(() => setIsSubmitting(false));
  };

  if (isLoading) {
    return null;
  }

  if (vehicles.length === 0) {
    return (
      <section className="emergency-page">
        <div className="emergency-page__backdrop"></div>

        <div className="emergency-shell">
          <div className="emergency-empty-state">
            <p className="emergency-hero__eyebrow">Emergency Service</p>
            <h1>Register a vehicle before raising an emergency request.</h1>
            <p>Emergency support always maps to a saved vehicle record, so add the vehicle first and then come back here.</p>
            <div className="emergency-empty-state__actions">
              <Link className="emergency-hero__button" to={getAddVehicleRoute()}>
                Add Vehicle
              </Link>
              <Link className="emergency-hero__secondary" to={getDashboardRoute()}>
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="emergency-page">
      <div className="emergency-page__backdrop"></div>

      <div className="emergency-shell">
        <header className="emergency-hero">
          <div className="emergency-hero__content">
            <p className="emergency-hero__eyebrow">Emergency Dispatch</p>
            <h1>Raise urgent roadside support requests with the right vehicle, location, and priority context.</h1>
            <p className="emergency-hero__copy">
              Share the exact location, issue, and transport need instantly so the workshop team can dispatch support without delay.
            </p>

            <div className="emergency-hero__actions">
              <Link className="emergency-hero__secondary" to={getDashboardRoute()}>
                Back to Dashboard
              </Link>
            </div>
          </div>

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
              <span>Latest request</span>
              <strong>{formatDisplayDate(summary.latest, "No SOS yet")}</strong>
            </article>
          </div>
        </header>

        <div className="emergency-layout">
          <form className="emergency-form" onSubmit={handleSubmit}>
            <div className="emergency-form__header">
              <h2>Create SOS request</h2>
              <p>Select the vehicle, add the roadside location, and describe what happened as clearly as possible.</p>
            </div>

            <div className="emergency-form__grid">
              <label className="emergency-field emergency-field--full">
                <span>Vehicle</span>
                <select name="vehicleId" onChange={handleChange} value={form.vehicleId}>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.brand} {vehicle.model} • {vehicle.registration_number}
                    </option>
                  ))}
                </select>
              </label>

              <label className="emergency-field emergency-field--full">
                <span>Emergency Location</span>
                <textarea
                  name="emergencyLocation"
                  onChange={handleChange}
                  placeholder="Enter roadside location, nearby landmark, area, highway point, or pincode"
                  rows={3}
                  value={form.emergencyLocation}
                />
              </label>

              <label className="emergency-field emergency-field--full">
                <span>Issue Details</span>
                <textarea
                  name="complaint"
                  onChange={handleChange}
                  placeholder="Example: engine stalled, tyre burst, battery dead, towing needed, accident assistance required..."
                  rows={4}
                  value={form.complaint}
                />
              </label>

              <label className="emergency-field">
                <span>Priority</span>
                <select
                  name="emergencyPriority"
                  onChange={handleChange}
                  value={form.emergencyPriority}
                >
                  {emergencyPriorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="emergency-field">
                <span>Transport</span>
                <select
                  name="transportOption"
                  onChange={handleChange}
                  value={form.transportOption}
                >
                  {transportOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="emergency-form__vehicle-note">
              <span>Selected vehicle</span>
              <strong>
                {selectedVehicle
                  ? `${selectedVehicle.brand} ${selectedVehicle.model} • ${formatVehicleTypeLabel(selectedVehicle.vehicle_type)}`
                  : "Choose a vehicle"}
              </strong>
            </div>

            <button className="emergency-form__submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Raising SOS..." : "Dispatch SOS Request"}
            </button>
          </form>

          <section className="emergency-board">
            <div className="emergency-board__header">
              <h2>Your emergency requests</h2>
              <p>Track assigned mechanic, request priority, transport mode, and the latest dispatch status here.</p>
            </div>

            <div className="emergency-board__list">
              {requests.length > 0 ? (
                requests.map((request) => (
                  <article className="emergency-card" key={request.id}>
                    <div className="emergency-card__top">
                      <div>
                        <h3>
                          {request.brand} {request.model}
                        </h3>
                        <p>{request.registration_number}</p>
                      </div>

                      <div className="emergency-card__badges">
                        <span className="emergency-card__badge emergency-card__badge--priority">
                          {formatStatusLabel(request.emergency_priority)}
                        </span>
                        <span className="emergency-card__badge">
                          {formatStatusLabel(request.emergency_status || request.status)}
                        </span>
                      </div>
                    </div>

                    <div className="emergency-card__meta">
                      <div>
                        <span>Requested on</span>
                        <strong>
                          {formatDisplayDate(request.emergency_requested_at || request.created_at)}
                        </strong>
                      </div>
                      <div>
                        <span>Transport</span>
                        <strong>{formatTransportOptionLabel(request.transport_option)}</strong>
                      </div>
                      <div>
                        <span>Assigned mechanic</span>
                        <strong>{request.mechanic_name || "Assigning..."}</strong>
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
                  </article>
                ))
              ) : (
                <div className="emergency-empty">
                  No emergency requests yet. Use the form to notify the nearest workshop support team.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
