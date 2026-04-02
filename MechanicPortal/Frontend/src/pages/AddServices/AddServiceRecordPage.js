import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, CREATE_SERVICE_RECORD_API, GET_SERVICE_RECORD_DETAILS_API, GET_VEHICLES_API, UPDATE_SERVICE_RECORD_API, } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import { showApiError } from "../../utils/apiError";
import { getDashboardRoute, getLoginRoute, getStoredToken, } from "../../utils/session";
import { formatDateTime, formatStatusLabel, } from "../../utils/formatters";
import "./AddProduct.css";

export default function MechanicAddServiceRecordPage() {
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState({
    vehicleId: "",
    serviceType: "",
    complaint: "",
    workSummary: "",
    status: "requested",
    bookingDate: "",
    amount: "",
    kmReading: "",
    serviceDate: "",
    nextServiceDate: "",
    bookingTimeSlot: "",
    estimatedHours: "1",
    transportOption: "drop_off",
  });
  const [serviceRecordDetails, setServiceRecordDetails] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const navigate = useNavigate();
  const { recordId } = useParams();
  const isEditing = Boolean(recordId);
  const toast = useToast();
  const isBillingRequired = form.status === "completed";
  const selectedVehicle =
    vehicles.find((vehicle) => String(vehicle.id) === form.vehicleId) || null;
  const requiredFieldTarget =
    5 + (isBillingRequired ? 4 : 0);
  const serviceFieldsCompleted = [
    form.vehicleId,
    form.serviceType,
    form.status,
    form.bookingDate,
    form.estimatedHours,
    ...(isBillingRequired
      ? [form.amount, form.kmReading, form.serviceDate, form.nextServiceDate]
      : []),
  ].filter((value) => String(value).trim()).length;
  const hasCustomerFeedback = Boolean(
    serviceRecordDetails?.customer_rating ||
    String(serviceRecordDetails?.customer_feedback || "").trim()
  );

  const applyServiceRecordDetails = (record) => {
    setServiceRecordDetails(record || null);

    if (!record) {
      return;
    }

    setForm({
      vehicleId: String(record.vehicle_id ?? ""),
      serviceType: record.service_type ?? "",
      complaint: record.complaint ?? "",
      workSummary: record.work_summary ?? "",
      status: record.status ?? "requested",
      bookingDate: record.booking_date ? String(record.booking_date).slice(0, 10) : "",
      amount: record.amount !== null && record.amount !== undefined ? String(record.amount) : "",
      kmReading:
        record.km_reading !== null && record.km_reading !== undefined
          ? String(record.km_reading)
          : "",
      serviceDate: record.service_date ? String(record.service_date).slice(0, 10) : "",
      nextServiceDate:
        record.next_service_date ? String(record.next_service_date).slice(0, 10) : "",
      bookingTimeSlot: record.booking_time_slot ? String(record.booking_time_slot).slice(0, 5) : "",
      estimatedHours:
        record.estimated_hours !== null && record.estimated_hours !== undefined
          ? String(record.estimated_hours)
          : "1",
      transportOption: record.transport_option ?? "drop_off",
    });
  };

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    setIsLoadingRecord(isEditing);

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_VEHICLES_API(),
      (response) => {
        setVehicles(response);
      },
      (error) => {
        showApiError(toast, error, "Failed to load vehicles.");
        setIsLoadingRecord(false);
      },
      "",
      null,
      {}
    ).catch(() => {
      return undefined;
    });

    if (!isEditing) {
      setIsLoadingRecord(false);
      return;
    }

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_SERVICE_RECORD_DETAILS_API(recordId),
      (record) => {
        applyServiceRecordDetails(record);
        setIsLoadingRecord(false);
      },
      (error) => {
        showApiError(toast, error, "Failed to load service record.");
        setIsLoadingRecord(false);
      },
      "",
      null,
      {}
    ).catch(() => {
      return undefined;
    });
  }, [isEditing, navigate, recordId, toast]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previousForm) => ({ ...previousForm, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.vehicleId || !form.serviceType.trim() || !form.status.trim()) {
      toast.error("Vehicle, service type, and status are required.");
      return;
    }

    if (
      isBillingRequired &&
      (!String(form.amount).trim() ||
        !String(form.kmReading).trim() ||
        !form.serviceDate ||
        !form.nextServiceDate)
    ) {
      toast.error("Completed records require billing and schedule details.");
      return;
    }

    if (!form.bookingDate) {
      toast.error("Schedule date is required.");
      return;
    }

    if (!String(form.estimatedHours).trim() || Number(form.estimatedHours) <= 0) {
      toast.error("Workload hours must be greater than zero.");
      return;
    }

    setIsSaving(true);

    const payload = {
      ...form,
      vehicleId: Number(form.vehicleId),
      amount: form.amount ? Number(form.amount) : 0,
      kmReading: form.kmReading ? Number(form.kmReading) : null,
      estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : 1,
    };

    makeApiCall(
      isEditing ? API_CALL_TYPE.PUT_CALL : API_CALL_TYPE.POST_CALL,
      isEditing ? UPDATE_SERVICE_RECORD_API(recordId) : CREATE_SERVICE_RECORD_API(),
      (response) => {
        if (isEditing) {
          applyServiceRecordDetails(response);
        }

        toast.success(
          isEditing
            ? "Service record updated successfully"
            : "Service record saved successfully"
        );
        setIsSaving(false);
        navigate(getDashboardRoute(), { replace: true });
      },
      (error) => {
        toast.error(
          error.response?.data?.error ||
          (isEditing ? "Failed to update service record" : "Failed to save service record")
        );
        setIsSaving(false);
      },
      "",
      null,
      payload
    ).catch(() => {
      return undefined;
    });
  };

  return (
    <section className="add-product-page">
      <div className="add-product-page__backdrop"></div>

      <div className="add-product-layout">
        <div className="add-product-hero">
          <div className="add-product-hero__top">
            <span className="add-product-hero__badge">
              {isEditing ? "Service Update" : "Service Entry"}
            </span>
          </div>

          <div className="add-product-hero__meta">
            <article className="add-product-hero__meta-card add-product-hero__meta-card--wide">
              <span>Current service context</span>
              <strong>
                {selectedVehicle
                  ? `${selectedVehicle.registration_number} · ${selectedVehicle.brand} ${selectedVehicle.model}`
                  : "Select a vehicle to see live context"}
              </strong>
            </article>
            <article className="add-product-hero__meta-card">
              <span>Vehicles available</span>
              <strong>{vehicles.length}</strong>
            </article>
            <article className="add-product-hero__meta-card">
              <span>Core fields</span>
              <strong>{serviceFieldsCompleted}/{requiredFieldTarget} completed</strong>
            </article>
            <article className="add-product-hero__meta-card">
              <span>Status</span>
              <strong>{formatStatusLabel(form.status, "Not set")}</strong>
            </article>
            <article className="add-product-hero__meta-card">
              <span>Workload plan</span>
              <strong>{form.estimatedHours ? `${form.estimatedHours} hrs` : "Add estimate"}</strong>
            </article>
          </div>
        </div>

        <form className="add-product-card" onSubmit={handleSubmit}>
          <div className="add-product-card__header">
            <p className="add-product-card__eyebrow">
              {isEditing ? "Service update" : "Service creation"}
            </p>
            <h2>{isEditing ? "Update service workflow details" : "Create a new service workflow"}</h2>
            <span>
              {isEditing
                ? "Review the current record and update its operational details."
                : "Select a vehicle and create a structured service workflow record."}
            </span>
          </div>

          {isLoadingRecord ? (
            <div className="dashboard-empty">
              <div className="dashboard-empty__badge">Loading record</div>
              <h3>Preparing service form...</h3>
            </div>
          ) : (
            <div className="add-product-card__section">
              <div className="add-product-card__grid">
                <label className="add-product-card__field add-product-card__field--span-2">
                  <span>Select Vehicle</span>
                  <select name="vehicleId" value={form.vehicleId} onChange={handleChange} required>
                    <option value="">Choose a vehicle</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.registration_number} - {vehicle.brand} {vehicle.model}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="add-product-card__field">
                  <span>Service Type</span>
                  <input
                    name="serviceType"
                    placeholder="General service / Engine repair / Oil change"
                    value={form.serviceType}
                    onChange={handleChange}
                    required
                  />
                </label>

                <label className="add-product-card__field">
                  <span>Status</span>
                  <select name="status" value={form.status} onChange={handleChange} required>
                    <option value="requested">Requested</option>
                    <option value="accepted">Accepted</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </label>

                <label className="add-product-card__field add-product-card__field--span-2">
                  <div className="add-product-card__field-label">
                    <span className="add-product-card__field-label-title">Complaint</span>
                    <span className="add-product-card__field-badge">Optional</span>
                  </div>
                  <textarea
                    name="complaint"
                    placeholder="Describe the customer complaint"
                    value={form.complaint}
                    onChange={handleChange}
                  />
                </label>

                <label className="add-product-card__field add-product-card__field--span-2">
                  <div className="add-product-card__field-label">
                    <span className="add-product-card__field-label-title">Work Summary</span>
                    <span className="add-product-card__field-badge">Optional</span>
                  </div>
                  <textarea
                    name="workSummary"
                    placeholder="Describe the work completed"
                    value={form.workSummary}
                    onChange={handleChange}
                  />
                </label>

                <label className="add-product-card__field">
                  <span>Schedule Date</span>
                  <input
                    name="bookingDate"
                    type="date"
                    value={form.bookingDate}
                    onChange={handleChange}
                    required
                  />
                </label>

                <label className="add-product-card__field">
                  <span>Bill Amount</span>
                  <input name="amount" type="number" value={form.amount} onChange={handleChange} />
                </label>

                <label className="add-product-card__field">
                  <span>KM Reading</span>
                  <input name="kmReading" type="number" value={form.kmReading} onChange={handleChange} />
                </label>

                <label className="add-product-card__field">
                  <span>Service Date</span>
                  <input name="serviceDate" type="date" value={form.serviceDate} onChange={handleChange} />
                </label>

                <label className="add-product-card__field">
                  <span>Time Slot</span>
                  <input
                    name="bookingTimeSlot"
                    type="time"
                    value={form.bookingTimeSlot}
                    onChange={handleChange}
                  />
                </label>

                <label className="add-product-card__field">
                  <span>Workload Hours</span>
                  <input
                    min="0.5"
                    name="estimatedHours"
                    step="0.5"
                    type="number"
                    value={form.estimatedHours}
                    onChange={handleChange}
                  />
                </label>

                <label className="add-product-card__field">
                  <span>Transport</span>
                  <select
                    name="transportOption"
                    value={form.transportOption}
                    onChange={handleChange}
                  >
                    <option value="drop_off">Drop Off</option>
                    <option value="pickup_drop">Pickup & Drop</option>
                  </select>
                </label>

                <label className="add-product-card__field">
                  <span>Next Service Date</span>
                  <input
                    name="nextServiceDate"
                    type="date"
                    value={form.nextServiceDate}
                    onChange={handleChange}
                  />
                </label>
              </div>
            </div>
          )}

          <button className="add-product-card__button" type="submit" disabled={isSaving || isLoadingRecord}>
            {isSaving ? "Saving..." : isEditing ? "Update service record" : "Save service record"}
          </button>
        </form>

        {isEditing ? (
          <section className="add-product-card add-product-card--complaint">
            <div className="add-product-card__header">
              <p className="add-product-card__eyebrow">Customer Rating</p>
              <h2>{hasCustomerFeedback ? "Customer feedback received" : "No customer rating yet"}</h2>
              <span>
                {hasCustomerFeedback
                  ? "Completed-service rating and written feedback from the customer are shown here."
                  : "When the customer rates this completed service, the score and written feedback will appear here."}
              </span>
            </div>

            {hasCustomerFeedback ? (
              <div className="add-product-complaint">
                <div className="add-product-complaint__summary">
                  <article className="add-product-complaint__summary-card">
                    <span>Customer rating</span>
                    <strong>
                      {serviceRecordDetails.customer_rating
                        ? `${serviceRecordDetails.customer_rating} / 5`
                        : "Feedback only"}
                    </strong>
                  </article>
                  <article className="add-product-complaint__summary-card">
                    <span>Feedback shared on</span>
                    <strong>{formatDateTime(serviceRecordDetails.customer_feedback_at, "Not available")}</strong>
                  </article>
                  <article className="add-product-complaint__summary-card">
                    <span>Current status</span>
                    <strong>{formatStatusLabel(serviceRecordDetails.status, "Requested")}</strong>
                  </article>
                  <article className="add-product-complaint__summary-card">
                    <span>Assigned mechanic</span>
                    <strong>{serviceRecordDetails.mechanic_name || "Not assigned"}</strong>
                  </article>
                </div>

                <div className="add-product-complaint__info">
                  <span>Customer feedback note</span>
                  <strong>{serviceRecordDetails.customer_feedback || "The customer only submitted a star rating."}</strong>
                  <p>
                    Use this feedback along with complaint history to understand how the customer experienced the completed job.
                  </p>
                </div>
              </div>
            ) : (
              <div className="add-product-complaint__empty">
                <strong>No rating has been submitted for this service record.</strong>
                <p>
                  Customer star rating and written feedback will appear here after the completed service is reviewed.
                </p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </section>
  );
}
