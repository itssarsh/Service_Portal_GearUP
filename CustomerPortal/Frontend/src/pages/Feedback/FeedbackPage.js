import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, SERVICE_RECORD_API } from "../../services/api";
import { getDashboardRoute, getStoredToken, isAuthError } from "../../utils/session";
import { formatDisplayDate, formatStatusLabel } from "../../utils/formatters";
import "./Feedback.css";

export default function CustomerFeedbackPage() {
  const { recordId } = useParams();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [serviceRecord, setServiceRecord] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!getStoredToken()) {
      navigate("/", { replace: true });
      return;
    }

    if (!recordId) {
      toast.error("Service record ID is required");
      navigate(getDashboardRoute());
      return;
    }

    const handleError = (error) => {
      if (isAuthError(error)) {
        toast.error(error.response?.data?.error || "Please login again.");
        navigate("/", { replace: true });
        return;
      }
      toast.error(error.response?.data?.error || "Failed to load service record");
      setIsLoading(false);
    };

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      SERVICE_RECORD_API.details(recordId),
      (response) => {
        setServiceRecord(response);
        if (response.customer_rating) {
          setRating(response.customer_rating);
        }
        if (response.customer_feedback) {
          setFeedback(response.customer_feedback);
        }
        setIsLoading(false);
      },
      handleError,
      "",
      null,
      {},
      { skipGlobalLoader: true }
    ).catch(() => {
      setIsLoading(false);
    });
  }, [recordId, navigate, toast]);

  const handleStarClick = (starValue) => {
    if (serviceRecord?.customer_rating || serviceRecord?.customer_feedback) {
      return;
    }

    setRating(starValue);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    if (serviceRecord?.customer_rating || serviceRecord?.customer_feedback) {
      toast.error("Mechanic rating has already been submitted for this service");
      return;
    }

    setIsSubmitting(true);

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      SERVICE_RECORD_API.feedback(recordId),
      (response) => {
        setServiceRecord(response);
        toast.success("Mechanic rating saved successfully");
        setIsSubmitting(false);
        window.setTimeout(() => navigate(getDashboardRoute()), 1000);
      },
      (error) => {
        toast.error(error.response?.data?.error || "Failed to submit feedback");
        setIsSubmitting(false);
      },
      "",
      null,
      {
        rating,
        feedback: feedback.trim(),
      }
    ).catch(() => undefined);
  };

  if (isLoading) {
    return (
      <section className="mechanic-rating-page">
        <div className="mechanic-rating-page__backdrop"></div>
        <div className="mechanic-rating-page__mesh"></div>
        <div className="mechanic-rating-container">
          <div className="mechanic-rating-card mechanic-rating-card--empty">
            <p>Loading rating screen...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!serviceRecord) {
    return (
      <section className="mechanic-rating-page">
        <div className="mechanic-rating-page__backdrop"></div>
        <div className="mechanic-rating-page__mesh"></div>
        <div className="mechanic-rating-container">
          <div className="mechanic-rating-card mechanic-rating-card--empty">
            <p>Service record not found.</p>
            <Link className="mechanic-rating-card__back" to={getDashboardRoute()}>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mechanic-rating-page">
      <div className="mechanic-rating-page__backdrop"></div>
      <div className="mechanic-rating-page__mesh"></div>

      <div className="mechanic-rating-container">
        <header className="mechanic-rating-hero">
          <div className="mechanic-rating-hero__content">
            <p className="mechanic-rating-hero__eyebrow">Rate Mechanic</p>
            <h1>Rate the mechanic based on service quality, communication, and overall execution.</h1>
            <p className="mechanic-rating-hero__description">
              This screen is only for the mechanic and service visit. Product or portal feedback stays separate in the feedback section.
            </p>

            <div className="mechanic-rating-hero__actions">
              <Link className="mechanic-rating-hero__button" to={getDashboardRoute()}>
                Back to Dashboard
              </Link>
            </div>
          </div>

          <aside className="mechanic-rating-summary">
            <div className="mechanic-rating-summary__label">Assigned mechanic</div>
            <strong>{serviceRecord.mechanic_name || "Not assigned yet"}</strong>
            <span>{serviceRecord.service_type || "Service"}</span>
          </aside>
        </header>

        <section className="mechanic-rating-grid">
          <article className="mechanic-rating-card">
            <div className="mechanic-rating-card__header">
              <p className="mechanic-rating-card__eyebrow">Service Record</p>
              <h2>{serviceRecord.vehicle_name || `${serviceRecord.brand || ""} ${serviceRecord.model || ""}`.trim()}</h2>
              <span>
                {serviceRecord.registration_number || "Registration not available"} •{" "}
                {serviceRecord.service_type || "Service details pending"}
              </span>
            </div>

            <div className="mechanic-rating-details">
              <div className="mechanic-rating-details__item">
                <span>Service date</span>
                <strong>{formatDisplayDate(serviceRecord.service_date)}</strong>
              </div>
              <div className="mechanic-rating-details__item">
                <span>Status</span>
                <strong>{formatStatusLabel(serviceRecord.status)}</strong>
              </div>
              <div className="mechanic-rating-details__item">
                <span>Mechanic</span>
                <strong>{serviceRecord.mechanic_name || "Not assigned yet"}</strong>
              </div>
              <div className="mechanic-rating-details__item">
                <span>Current rating</span>
                <strong>{serviceRecord.customer_rating ? `${serviceRecord.customer_rating} / 5` : "Not rated"}</strong>
              </div>
            </div>
          </article>

          <article className="mechanic-rating-card">
            <div className="mechanic-rating-card__header">
              <p className="mechanic-rating-card__eyebrow">Your Review</p>
              <h2>Submit mechanic review</h2>
              <span>Share your view on work quality, communication, timeliness, and the overall service experience.</span>
            </div>

            <form className="mechanic-rating-form" onSubmit={handleSubmit}>
              <div className="mechanic-rating-form__stars">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className={`mechanic-rating-form__star${
                      rating >= star ? " mechanic-rating-form__star--active" : ""
                    }`}
                    onClick={() => handleStarClick(star)}
                    disabled={isSubmitting}
                  >
                    ★
                  </button>
                ))}
              </div>

              <div className="mechanic-rating-form__rating-label">
                Selected rating: <strong>{rating || 0} / 5</strong>
              </div>

              {serviceRecord.customer_rating || serviceRecord.customer_feedback ? (
                <div className="mechanic-rating-form__rating-label">
                  This rating has already been submitted and can no longer be edited.
                </div>
              ) : null}

              <label className="mechanic-rating-form__field">
                <span>Feedback</span>
                <textarea
                  placeholder="How was the mechanic's work quality, communication, and service experience?"
                  value={feedback}
                  disabled={isSubmitting || Boolean(serviceRecord.customer_rating || serviceRecord.customer_feedback)}
                  onChange={(event) => setFeedback(event.target.value)}
                  rows={5}
                />
              </label>

              <button
                className="mechanic-rating-form__submit"
                type="submit"
                disabled={isSubmitting || Boolean(serviceRecord.customer_rating || serviceRecord.customer_feedback)}
              >
                {isSubmitting
                  ? "Submitting..."
                  : serviceRecord.customer_rating || serviceRecord.customer_feedback
                    ? "Review Submitted"
                    : "Submit Mechanic Review"}
              </button>
            </form>
          </article>
        </section>
      </div>
    </section>
  );
}
