import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, {
  API_CALL_TYPE,
  SERVICE_RECORD_API,
  VEHICLE_API,
} from "../../services/api";
import {
  clearSession,
  getAddVehicleRoute,
  getDashboardRoute,
  getLoginRoute,
  isAuthError,
  getStoredToken,
} from "../../utils/session";
import { normalizeWhitespace } from "../../utils/normalize";
import "./AddService.css";

const SERVICE_TYPES = [
  {
    value: "basic",
    label: "Basic",
    description: "Routine inspection, oil change, and general health check.",
  },
  {
    value: "full",
    label: "Full",
    description: "Detailed workshop visit for complete maintenance coverage.",
  },
  {
    value: "emergency",
    label: "Emergency",
    description: "Priority support for urgent breakdowns or unsafe driving issues.",
  },
];

const TRANSPORT_OPTIONS = [
  {
    value: "drop_off",
    label: "Self Drop-Off",
    description: "You bring the vehicle to the workshop at the selected time.",
  },
  {
    value: "pickup_drop",
    label: "Pickup & Drop",
    description: "Workshop team picks up the vehicle and returns it after service.",
  },
];

function getTodayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatBookingDateLabel(dateValue) {
  if (!dateValue) {
    return "Select a date";
  }

  const parsedDate = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

function convertTimeToMinutes(timeValue) {
  if (!timeValue || !timeValue.includes(":")) {
    return null;
  }

  const [hoursPart, minutesPart] = timeValue.split(":");
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatPreferredTimeLabel(timeValue) {
  const totalMinutes = convertTimeToMinutes(timeValue);

  if (totalMinutes === null) {
    return "Select time";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 || 12;

  return `${String(normalizedHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
}

function normalizeBookingTimeValue(timeValue) {
  const normalizedValue = String(timeValue || "").trim();

  if (convertTimeToMinutes(normalizedValue) !== null) {
    return normalizedValue;
  }

  const legacyMatch = normalizedValue.match(/^([01]\d|2[0-3]):([0-5]\d)/);

  return legacyMatch ? legacyMatch[0] : "";
}

export default function CustomerAddServiceRecordPage() {
  const [vehicles, setVehicles] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [form, setForm] = useState({
    vehicleId: "",
    mechanicId: "",
    serviceType: "basic",
    bookingDate: getTodayDateInputValue(),
    bookingTimeSlot: "",
    transportOption: "drop_off",
    concern: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { recordId } = useParams();
  const isEditing = Boolean(recordId);

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    const handleLoadError = (error) => {
      if (isAuthError(error)) {
        toast.error(error.response?.data?.error || "Please login again.");
        clearSession();
        navigate(getLoginRoute(), { replace: true });
        return;
      }

      toast.error(error.response?.data?.error || "Failed to load service booking form.");
      navigate(getDashboardRoute(), { replace: true });
      setIsLoading(false);
    };

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      VEHICLE_API.list,
      (vehicleList) => {
        const vehiclesData = vehicleList || [];
        setVehicles(vehiclesData);

        makeApiCall(
          API_CALL_TYPE.GET_CALL,
          SERVICE_RECORD_API.mechanics,
          (mechanicList) => {
            setMechanics(mechanicList || []);

            if (isEditing) {
              makeApiCall(
                API_CALL_TYPE.GET_CALL,
                SERVICE_RECORD_API.details(recordId),
                (booking) => {
                  if (!booking.customer_booking) {
                    toast.error("Only self-created bookings can be edited here.");
                    navigate(getDashboardRoute(), { replace: true });
                    setIsLoading(false);
                    return;
                  }

                  setForm({
                    vehicleId: booking.vehicle_id ? String(booking.vehicle_id) : "",
                    mechanicId: booking.mechanic_id ? String(booking.mechanic_id) : "",
                    serviceType: String(booking.service_type || "basic").trim().toLowerCase(),
                    bookingDate: booking.booking_date || getTodayDateInputValue(),
                    bookingTimeSlot: normalizeBookingTimeValue(booking.booking_time_slot),
                    transportOption: booking.transport_option || "drop_off",
                    concern: booking.complaint || "",
                  });
                  setIsLoading(false);
                },
                handleLoadError,
                "",
                null,
                {}
              ).catch(() => undefined);

              return;
            }

            if (vehiclesData.length > 0) {
              setForm((previousForm) => ({
                ...previousForm,
                vehicleId: previousForm.vehicleId || String(vehiclesData[0].id),
              }));
            }

            setIsLoading(false);
          },
          handleLoadError,
          "",
          null,
          {}
        ).catch(() => undefined);
      },
      handleLoadError,
      "",
      null,
      {}
    ).catch(() => undefined);
  }, [isEditing, navigate, recordId, toast]);

  const selectedVehicle = vehicles.find(
    (vehicle) => String(vehicle.id) === String(form.vehicleId)
  );
  const selectedMechanic = mechanics.find(
    (mechanic) => String(mechanic.id) === String(form.mechanicId)
  );
  const selectedServiceType =
    SERVICE_TYPES.find((serviceType) => serviceType.value === form.serviceType) || SERVICE_TYPES[0];
  const selectedTransportOption =
    TRANSPORT_OPTIONS.find((option) => option.value === form.transportOption) || TRANSPORT_OPTIONS[0];
  const bookingDateLabel = formatBookingDateLabel(form.bookingDate);
  const preferredTimeLabel = formatPreferredTimeLabel(form.bookingTimeSlot);
  const completedSteps = [
    form.vehicleId,
    form.serviceType,
    form.bookingDate,
    form.bookingTimeSlot,
    form.transportOption,
  ].filter(Boolean).length;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previousForm) => ({
      ...previousForm,
      [name]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.vehicleId || !form.bookingDate || !form.bookingTimeSlot) {
      toast.error("Vehicle, booking date, and preferred time are required.");
      return;
    }

    setIsSaving(true);

    const payload = {
      vehicleId: Number(form.vehicleId),
      mechanicId: form.mechanicId ? Number(form.mechanicId) : null,
      serviceType: form.serviceType,
      bookingDate: form.bookingDate,
      bookingTimeSlot: form.bookingTimeSlot,
      transportOption: form.transportOption,
      concern: normalizeWhitespace(form.concern),
    };

    const request = isEditing
      ? makeApiCall(
        API_CALL_TYPE.PUT_CALL,
        SERVICE_RECORD_API.update(recordId),
        () => {
          toast.success(
            isEditing
              ? "Service booking updated successfully."
              : "Service booking created successfully."
          );
          setIsSaving(false);
          navigate(getDashboardRoute(), { replace: true });
        },
        (error) => {
          toast.error(error.response?.data?.error || "Failed to save service booking.");
          setIsSaving(false);
        },
        "",
        null,
        payload
      )
      : makeApiCall(
        API_CALL_TYPE.POST_CALL,
        SERVICE_RECORD_API.create,
        () => {
          toast.success(
            isEditing
              ? "Service booking updated successfully."
              : "Service booking created successfully."
          );
          setIsSaving(false);
          navigate(getDashboardRoute(), { replace: true });
        },
        (error) => {
          toast.error(error.response?.data?.error || "Failed to save service booking.");
          setIsSaving(false);
        },
        "",
        null,
        payload
      );
    request.catch(() => undefined);
  };

  if (isLoading) {
    return null;
  }

  if (vehicles.length === 0) {
    return (
      <section className="add-service-page">
        <div className="add-service-page__backdrop"></div>

        <div className="add-service-layout">
          <div className="add-service-empty">
            <p className="add-service-empty__eyebrow">Service Booking</p>
            <h1>Register a vehicle before creating a service booking.</h1>
            <p>
              Service appointments are always tied to a saved vehicle record, so create the vehicle profile
              first and then come back here to choose the timing and service scope.
            </p>

            <div className="add-service-empty__actions">
              <Link className="add-service-empty__button" to={getAddVehicleRoute()}>
                Add Vehicle
              </Link>
              <Link
                className="add-service-empty__button add-service-empty__button--ghost"
                to={getDashboardRoute()}
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="add-service-page">
      <div className="add-service-page__backdrop"></div>

      <div className="add-service-layout">
        <div className="add-service-hero">
          <div className="add-service-hero__top">
            <Link className="add-service-hero__back" to={getDashboardRoute()}>
              Back to Dashboard
            </Link>
            <span className="add-service-hero__badge">
              {isEditing ? "Edit Booking" : "Service Booking"}
            </span>
          </div>

          <div className="add-service-hero__heading">
            <h1>{isEditing ? "Refine the booking details before the workshop slot is confirmed." : "Create a service booking with clear timing, service scope, and transport preferences."}</h1>
            <p>
              Choose the vehicle, service package, preferred date and time, and whether
              the workshop should arrange pickup and drop support.
            </p>
          </div>

          <div className="add-service-hero__meta">
            <article className="add-service-hero__meta-card add-service-hero__meta-card--wide">
              <span>Selected vehicle</span>
              <strong>
                {selectedVehicle
                  ? `${selectedVehicle.brand} ${selectedVehicle.model} • ${selectedVehicle.registration_number}`
                  : "Choose a vehicle"}
              </strong>
            </article>
            <article className="add-service-hero__meta-card">
              <span>Progress</span>
              <strong>{completedSteps}/5 ready</strong>
            </article>
            <article className="add-service-hero__meta-card">
              <span>Service type</span>
              <strong>{selectedServiceType.label}</strong>
            </article>
            <article className="add-service-hero__meta-card">
              <span>Pickup & drop</span>
              <strong>{selectedTransportOption.label}</strong>
            </article>
            <article className="add-service-hero__meta-card">
              <span>Preferred date</span>
              <strong>{bookingDateLabel}</strong>
            </article>
            <article className="add-service-hero__meta-card">
              <span>Preferred time</span>
              <strong>{preferredTimeLabel}</strong>
            </article>
            <article className="add-service-hero__meta-card">
              <span>Preferred mechanic</span>
              <strong>{selectedMechanic?.name || "No preference"}</strong>
            </article>
          </div>
        </div>

        <form className="add-service-card" onSubmit={handleSubmit}>
          <div className="add-service-card__header">
            <p className="add-service-card__eyebrow">Service Booking</p>
            <h2>{isEditing ? "Update booking details" : "Create workshop booking"}</h2>
            <span>
              Once submitted, this booking appears on the dashboard for tracking, updates, and follow-up actions.
            </span>
          </div>

          <div className="add-service-card__section">
            <div className="add-service-card__section-head">
              <div>
                <h3>1. Vehicle & service type</h3>
                <p>Select the registered vehicle and the level of service you want the workshop to perform.</p>
              </div>
              <span className="add-service-card__section-tag">Required</span>
            </div>

            <div className="add-service-card__grid">
              <label className="add-service-card__field">
                <span>Vehicle</span>
                <select name="vehicleId" value={form.vehicleId} onChange={handleChange}>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.brand} {vehicle.model} • {vehicle.registration_number}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="add-service-card__choices">
              {SERVICE_TYPES.map((serviceType) => (
                <label className="add-service-choice" key={serviceType.value}>
                  <input
                    checked={form.serviceType === serviceType.value}
                    name="serviceType"
                    onChange={handleChange}
                    type="radio"
                    value={serviceType.value}
                  />
                  <span className="add-service-choice__content">
                    <strong>{serviceType.label}</strong>
                    <span>{serviceType.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="add-service-card__section add-service-card__section--schedule">
            <div className="add-service-card__section-head">
              <div>
                <h3>2. Date & preferred time</h3>
                <p>Choose the date and preferred arrival window that best fits your schedule.</p>
              </div>
              <span className="add-service-card__section-tag">Required</span>
            </div>

            <div className="add-service-schedule">
              <div className="add-service-schedule__summary">
                <div>
                  <span className="add-service-card__field-badge">Selected visit timing</span>
                  <strong>{bookingDateLabel}</strong>
                  <p>{preferredTimeLabel}</p>
                </div>

                <div className="add-service-schedule__summary-note">
                  <span>Booking type</span>
                  <strong>Time picker</strong>
                </div>
              </div>

              <div className="add-service-card__grid add-service-card__grid--single">
                <label className="add-service-card__field add-service-card__field--date">
                  <span>Preferred date</span>
                  <div className="add-service-card__input-shell add-service-card__input-shell--date">
                    <input
                      min={getTodayDateInputValue()}
                      name="bookingDate"
                      onChange={handleChange}
                      type="date"
                      value={form.bookingDate}
                    />
                  </div>
                </label>

                <label className="add-service-card__field add-service-card__field--time">
                  <span>Preferred time</span>
                  <div className="add-service-card__input-shell add-service-card__input-shell--time">
                    <input
                      max="18:00"
                      min="09:00"
                      name="bookingTimeSlot"
                      onChange={handleChange}
                      step="1800"
                      type="time"
                      value={form.bookingTimeSlot}
                    />
                  </div>
                  <small className="add-service-card__field-help">
                    Select a preferred workshop time between 09:00 AM and 06:00 PM.
                  </small>
                </label>
              </div>
            </div>
          </div>

          <div className="add-service-card__section">
            <div className="add-service-card__section-head">
              <div>
                <h3>3. Preferred mechanic</h3>
                <p>Select a mechanic only if you have a clear preference. Otherwise the workshop can assign the best fit.</p>
              </div>
              <span className="add-service-card__section-tag add-service-card__section-tag--optional">
                Optional
              </span>
            </div>

            <div className="add-service-card__grid">
              <label className="add-service-card__field">
                <span>Preferred mechanic</span>
                <select name="mechanicId" value={form.mechanicId} onChange={handleChange}>
                  <option value="">No preference</option>
                  {mechanics.map((mechanic) => (
                    <option key={mechanic.id} value={mechanic.id}>
                      {mechanic.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="add-service-card__section">
            <div className="add-service-card__section-head">
              <div>
                <h3>4. Pickup & drop option</h3>
                <p>Tell us whether you will visit the workshop yourself or need managed vehicle pickup support.</p>
              </div>
              <span className="add-service-card__section-tag">Required</span>
            </div>

            <div className="add-service-card__choices add-service-card__choices--transport">
              {TRANSPORT_OPTIONS.map((option) => (
                <label className="add-service-choice" key={option.value}>
                  <input
                    checked={form.transportOption === option.value}
                    name="transportOption"
                    onChange={handleChange}
                    type="radio"
                    value={option.value}
                  />
                  <span className="add-service-choice__content">
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="add-service-card__section">
            <div className="add-service-card__section-head">
              <div>
                <h3>5. Notes for the workshop</h3>
                <p>Optional notes help the team prepare parts, checks, or diagnostics before the booking starts.</p>
              </div>
              <span className="add-service-card__section-tag add-service-card__section-tag--optional">
                Optional
              </span>
            </div>

            <label className="add-service-card__field add-service-card__field--span-2">
              <div className="add-service-card__field-label">
              </div>
              <textarea
                name="concern"
                onChange={handleChange}
                placeholder="Share symptoms, service requests, unusual sounds, warning lights, or anything the workshop should know in advance"
                value={form.concern}
              />
            </label>
          </div>

          <button className="add-service-card__button" disabled={isSaving} type="submit">
            {isSaving
              ? isEditing
                ? "Updating booking..."
                : "Booking service..."
              : isEditing
                ? "Save Booking Changes"
                : "Create Service Booking"}
          </button>
        </form>
      </div>
    </section>
  );
}
