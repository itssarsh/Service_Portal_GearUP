import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, SERVICE_RECORD_API } from "../../services/api";
import {
  formatComplaintStatusLabel,
  formatDateTime,
  formatDisplayDate,
  formatStatusLabel,
} from "../../utils/formatters";
import {
  getChatRoute,
  getDashboardRoute,
  getStoredToken,
  isAuthError,
} from "../../utils/session";
import "./Complaint.css";

export default function CustomerComplaintPage() {
  const { recordId } = useParams();
  const [complaint, setComplaint] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [serviceRecord, setServiceRecord] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();
  const hasMechanicAction = Boolean(
    serviceRecord?.customer_complaint_mechanic_note ||
    serviceRecord?.customer_complaint_updated_at ||
    ["in_review", "resolved"].includes(String(serviceRecord?.customer_complaint_status || "").toLowerCase())
  );
  const supportChatRoute = serviceRecord?.id && serviceRecord?.vehicle_id
    ? `${getChatRoute()}?${new URLSearchParams({
        serviceRecordId: String(serviceRecord.id),
        vehicleId: String(serviceRecord.vehicle_id),
      }).toString()}`
    : getChatRoute();

  useEffect(() => {
    if (!getStoredToken()) {
      navigate("/", { replace: true });
      return;
    }

    if (!recordId) {
      toast.error("Service record ID is required");
      navigate(getDashboardRoute(), { replace: true });
      return;
    }

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      SERVICE_RECORD_API.details(recordId),
      (response) => {
        setServiceRecord(response);
        setComplaint(response.customer_complaint || "");
        setIsLoading(false);
      },
      (error) => {
        if (isAuthError(error)) {
          toast.error(error.response?.data?.error || "Please login again.");
          navigate("/", { replace: true });
          return;
        }

        toast.error(error.response?.data?.error || "Failed to load complaint details");
        setIsLoading(false);
      },
      "",
      null,
      {},
      { skipGlobalLoader: true }
    ).catch(() => setIsLoading(false));
  }, [recordId, navigate, toast]);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!complaint.trim()) {
      toast.error("Please enter complaint details");
      return;
    }

    if (serviceRecord?.customer_complaint) {
      toast.error("A complaint has already been submitted for this service");
      return;
    }

    setIsSubmitting(true);

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      SERVICE_RECORD_API.complaints(recordId),
      (response) => {
        setServiceRecord(response);
        setComplaint(response.customer_complaint || complaint.trim());
        toast.success("Complaint saved successfully");
        setIsSubmitting(false);
        window.setTimeout(() => navigate(getDashboardRoute()), 1000);
      },
      (error) => {
        toast.error(error.response?.data?.error || "Failed to submit complaint");
        setIsSubmitting(false);
      },
      "",
      null,
      {
        complaint: complaint.trim(),
      }
    ).catch(() => undefined);
  };

  if (isLoading) {
    return (
      <section className="complaint-page">
        <div className="complaint-page__backdrop"></div>
        <div className="complaint-page__mesh"></div>
        <div className="complaint-container">
          <div className="complaint-card complaint-card--empty">
            <p>Loading complaint screen...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!serviceRecord) {
    return (
      <section className="complaint-page">
        <div className="complaint-page__backdrop"></div>
        <div className="complaint-page__mesh"></div>
        <div className="complaint-container">
          <div className="complaint-card complaint-card--empty">
            <p>Service record not found.</p>
            <Link className="complaint-card__back" to={getDashboardRoute()}>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="complaint-page">
      <div className="complaint-page__backdrop"></div>
      <div className="complaint-page__mesh"></div>

      <div className="complaint-container">
        <header className="complaint-hero">
          <div className="complaint-hero__content">
            <p className="complaint-hero__eyebrow">Service Complaint</p>
            <h1>Raise a formal complaint for this service record when service quality or conduct falls short.</h1>
            <p className="complaint-hero__description">
              Use this screen for service issues, billing concerns, delays, quality gaps, or conduct-related complaints. This stays separate from mechanic rating and product feedback.
            </p>

            <div className="complaint-hero__actions">
              <Link className="complaint-hero__button" to={getDashboardRoute()}>
                Back to Dashboard
              </Link>
              {serviceRecord?.customer_complaint && serviceRecord?.mechanic_name ? (
                <Link className="complaint-hero__button" to={supportChatRoute}>
                  Open Support Chat
                </Link>
              ) : null}
            </div>
          </div>

          <aside className="complaint-summary">
            <div className="complaint-summary__label">Complaint status</div>
            <strong>{formatComplaintStatusLabel(serviceRecord.customer_complaint_status, "Not raised")}</strong>
            <span>{serviceRecord.service_type || "Service record"}</span>
          </aside>
        </header>

        <section className="complaint-grid">
          <article className="complaint-card">
            <div className="complaint-card__header">
              <p className="complaint-card__eyebrow">Service Record</p>
              <h2>{serviceRecord.vehicle_name || `${serviceRecord.brand || ""} ${serviceRecord.model || ""}`.trim()}</h2>
              <span>
                {serviceRecord.registration_number || "Registration not available"} •{" "}
                {serviceRecord.service_type || "Service details pending"}
              </span>
            </div>

            <div className="complaint-details">
              <div className="complaint-details__item">
                <span>Service date</span>
                <strong>{formatDisplayDate(serviceRecord.service_date)}</strong>
              </div>
              <div className="complaint-details__item">
                <span>Status</span>
                <strong>{formatStatusLabel(serviceRecord.status)}</strong>
              </div>
              <div className="complaint-details__item">
                <span>Mechanic</span>
                <strong>{serviceRecord.mechanic_name || "Not assigned yet"}</strong>
              </div>
              <div className="complaint-details__item">
                <span>Existing complaint</span>
                <strong>{serviceRecord.customer_complaint ? "Already raised" : "Not raised"}</strong>
              </div>
            </div>
          </article>

          <article className="complaint-card">
            <div className="complaint-card__header">
              <p className="complaint-card__eyebrow">Complaint Form</p>
              <h2>{serviceRecord.customer_complaint ? "Submitted complaint" : "Create complaint record"}</h2>
              <span>
                {serviceRecord.customer_complaint
                  ? "This complaint is now locked. Workshop actions and support notes will appear below."
                  : "Explain the issue clearly so the support team can review it quickly and fairly."}
              </span>
            </div>

            <form className="complaint-form" onSubmit={handleSubmit}>
              {serviceRecord.customer_complaint ? (
                <div className="complaint-form__field">
                  <span>This complaint has already been submitted and can no longer be edited.</span>
                </div>
              ) : null}

              <label className="complaint-form__field">
                <span>Complaint details</span>
                <textarea
                  placeholder="Explain the issue clearly: service problem, extra charge, delay, repeat fault, or staff behaviour concern"
                  value={complaint}
                  disabled={isSubmitting || Boolean(serviceRecord.customer_complaint)}
                  onChange={(event) => setComplaint(event.target.value)}
                  rows={6}
                />
              </label>

              <button
                className="complaint-form__submit"
                type="submit"
                disabled={isSubmitting || !complaint.trim() || Boolean(serviceRecord.customer_complaint)}
              >
                {isSubmitting
                  ? "Submitting..."
                  : serviceRecord.customer_complaint
                    ? "Complaint Submitted"
                    : "Submit Complaint Record"}
              </button>
            </form>
          </article>
        </section>

        {serviceRecord.customer_complaint ? (
          <article className="complaint-card complaint-card--response">
            <div className="complaint-card__header">
              <p className="complaint-card__eyebrow">Workshop Response</p>
              <h2>{hasMechanicAction ? "Latest complaint action" : "Waiting for workshop response"}</h2>
              <span>
                {hasMechanicAction
                  ? "The latest workshop action on your complaint is shown below."
                  : "The mechanic has not posted a complaint update yet. Any action taken will appear here automatically."}
              </span>
            </div>

            <div className="complaint-response">
              <div className="complaint-response__grid">
                <div className="complaint-details__item">
                  <span>Complaint status</span>
                  <strong>{formatComplaintStatusLabel(serviceRecord.customer_complaint_status, "Open")}</strong>
                </div>
                <div className="complaint-details__item">
                  <span>Submitted on</span>
                  <strong>{formatDateTime(serviceRecord.customer_complaint_created_at, "Not available")}</strong>
                </div>
                <div className="complaint-details__item">
                  <span>Last workshop update</span>
                  <strong>{formatDateTime(serviceRecord.customer_complaint_updated_at, "No update yet")}</strong>
                </div>
                <div className="complaint-details__item">
                  <span>Assigned mechanic</span>
                  <strong>{serviceRecord.mechanic_name || "Not assigned yet"}</strong>
                </div>
              </div>

              <div className="complaint-response__note">
                <span>Workshop note</span>
                <p>
                  {serviceRecord.customer_complaint_mechanic_note ||
                    "No workshop note has been added yet. Once the mechanic reviews the complaint, the latest action and note will be displayed here."}
                </p>
              </div>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
