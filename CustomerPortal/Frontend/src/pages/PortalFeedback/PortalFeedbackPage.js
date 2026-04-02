import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, USER_API } from "../../services/api";
import {
  getDashboardRoute,
  getLoginRoute,
  getStoredToken,
  isAuthError,
} from "../../utils/session";
import { formatDisplayDate } from "../../utils/formatters";
import "./PortalFeedback.css";

const REVIEW_FORMAT_PREFIX = "__feedback_v1__";

function createEmptyAnswers(questions) {
  return (questions || []).reduce((answers, field) => {
    answers[field.key] = "";
    return answers;
  }, {});
}

function serializeReviewAnswers(answers) {
  return `${REVIEW_FORMAT_PREFIX}${JSON.stringify({ answers })}`;
}

function parseReviewAnswers(reviewText, questions) {
  const emptyAnswers = createEmptyAnswers(questions);
  const normalizedText = String(reviewText || "").trim();
  const fallbackQuestionKey = questions?.[0]?.key || "feedback";

  if (!normalizedText) {
    return emptyAnswers;
  }

  if (!normalizedText.startsWith(REVIEW_FORMAT_PREFIX)) {
    return {
      ...emptyAnswers,
      [fallbackQuestionKey]: normalizedText,
    };
  }

  try {
    const parsedReview = JSON.parse(normalizedText.slice(REVIEW_FORMAT_PREFIX.length));
    const parsedAnswers = parsedReview?.answers || {};

    return (questions || []).reduce((answers, field) => {
      answers[field.key] = String(parsedAnswers[field.key] || "");
      return answers;
    }, {});
  } catch (error) {
    return {
      ...emptyAnswers,
      [fallbackQuestionKey]: normalizedText,
    };
  }
}

function getReviewPreview(reviewText, questions) {
  const answers = parseReviewAnswers(reviewText, questions);
  const firstAnswer = (questions || [])
    .map((field) => answers[field.key])
    .find((answer) => String(answer || "").trim());

  return firstAnswer || String(reviewText || "").trim() || "No written feedback shared.";
}

function getAnsweredReviewItems(reviewText, questions) {
  const answers = parseReviewAnswers(reviewText, questions);
  const reviewItems = (questions || [])
    .map((field) => ({
      question: field.question,
      answer: answers[field.key],
    }))
    .filter((item) => String(item.answer || "").trim());

  if (reviewItems.length > 0) {
    return reviewItems;
  }

  return [
    {
      question: "Feedback",
      answer: getReviewPreview(reviewText, questions),
    },
  ];
}

export default function CustomerPortalFeedbackPage() {
  const [feedbackQuestions, setFeedbackQuestions] = useState([]);
  const [portalReviews, setPortalReviews] = useState({
    questions: [],
    summary: { average_rating: 0, total_reviews: 0 },
    reviews: [],
    myReview: null,
  });
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    answers: {},
  });
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      USER_API.portalReviews,
      (response) => {
        const nextQuestions = response?.questions || [];
        const nextAnswers = parseReviewAnswers(response?.myReview?.review_text, nextQuestions);

        setFeedbackQuestions(nextQuestions);
        setPortalReviews(response || {});
        setReviewForm({
          rating: response?.myReview?.rating || 5,
          answers: nextAnswers,
        });
        setIsLoading(false);
      },
      (error) => {
        if (isAuthError(error)) {
          toast.error(error.response?.data?.error || "Please login again.");
          navigate(getLoginRoute(), { replace: true });
          return;
        }

        toast.error(error.response?.data?.error || "Failed to load portal feedback.");
        setIsLoading(false);
      },
      "",
      null,
      {},
      { skipGlobalLoader: true }
    ).catch(() => setIsLoading(false));
  }, [navigate, toast]);

  const handleAnswerChange = (fieldKey, value) => {
    setReviewForm((previousForm) => ({
      ...previousForm,
      answers: {
        ...previousForm.answers,
        [fieldKey]: value,
      },
    }));
  };

  const handleReviewSubmit = (event) => {
    event.preventDefault();
    setIsSavingReview(true);

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      USER_API.portalReviews,
      (response) => {
        const nextQuestions = response?.questions || [];
        const nextAnswers = parseReviewAnswers(response?.myReview?.review_text, nextQuestions);

        setFeedbackQuestions(nextQuestions);
        setPortalReviews(response || {});
        setReviewForm({
          rating: response?.myReview?.rating || reviewForm.rating,
          answers: nextAnswers,
        });
        toast.success("Feedback saved successfully.");
      },
      (error) => {
        toast.error(error.response?.data?.error || "Failed to save portal feedback.");
      },
      "",
      null,
      {
        rating: reviewForm.rating,
        reviewText: serializeReviewAnswers(reviewForm.answers),
      }
    )
      .catch(() => undefined)
      .finally(() => setIsSavingReview(false));
  };

  return (
    <section className="portal-feedback-page">
      <div className="portal-feedback-page__backdrop"></div>
      <div className="portal-feedback-page__mesh"></div>

      <div className="portal-feedback-container">
        <header className="portal-feedback-hero">
          <div className="portal-feedback-hero__content">
            <p className="portal-feedback-hero__eyebrow">Portal Feedback</p>
            <h1>Share feedback on the customer portal experience, not just the mechanic visit.</h1>
            <p className="portal-feedback-hero__description">
              This is separate from mechanic rating. Tell us how the dashboard, booking flow,
              notifications, profile experience, and SOS handling feel in actual use.
            </p>

            <div className="portal-feedback-hero__actions">
              <Link className="portal-feedback-hero__button" to={getDashboardRoute()}>
                Back to Dashboard
              </Link>
            </div>
          </div>

          <aside className="portal-feedback-summary">
            <div className="portal-feedback-summary__metric">
              <strong>{Number(portalReviews.summary?.average_rating || 0).toFixed(1)} / 5</strong>
              <span>Average rating</span>
            </div>
            <div className="portal-feedback-summary__metric">
              <strong>{portalReviews.summary?.total_reviews || 0}</strong>
              <span>Total reviews</span>
            </div>
          </aside>
        </header>

        <section className="portal-feedback-grid">
          <article className="portal-feedback-card portal-feedback-card--form">
            <div className="portal-feedback-card__header">
              <p className="portal-feedback-card__eyebrow">Your Feedback</p>
              <h2>Rate the portal and answer a few focused questions</h2>
              <span>Your latest submission is saved here and can be updated whenever your experience changes.</span>
            </div>

            {isLoading ? (
              <div className="portal-feedback-form__empty">Loading feedback form...</div>
            ) : (
              <form className="portal-feedback-form" onSubmit={handleReviewSubmit}>
                <div className="portal-feedback-form__stars">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      aria-label={`${value} star rating`}
                      className={`portal-feedback-form__star${
                        Number(reviewForm.rating) === value
                          ? " portal-feedback-form__star--active"
                          : ""
                      }`}
                      key={value}
                      onClick={() =>
                        setReviewForm((previousForm) => ({
                          ...previousForm,
                          rating: value,
                        }))
                      }
                      type="button"
                    >
                      ★
                    </button>
                  ))}
                </div>

                <div className="portal-feedback-form__rating-label">
                  Selected rating: <strong>{reviewForm.rating} / 5</strong>
                </div>

                {feedbackQuestions.length > 0 ? (
                  feedbackQuestions.map((field, index) => (
                    <label
                      className="portal-feedback-form__field"
                      htmlFor={field.key}
                      key={field.key}
                    >
                      <span>
                        Q{index + 1}. {field.question}
                      </span>
                      <textarea
                        className="portal-feedback-form__textarea"
                        id={field.key}
                        onChange={(event) => handleAnswerChange(field.key, event.target.value)}
                        placeholder={field.placeholder}
                        rows={4}
                        value={reviewForm.answers[field.key] || ""}
                      />
                    </label>
                  ))
                ) : (
                  <div className="portal-feedback-form__empty">
                    No feedback questions are available right now.
                  </div>
                )}

                <button
                  className="portal-feedback-form__submit"
                  disabled={feedbackQuestions.length === 0 || isSavingReview}
                  type="submit"
                >
                  {isSavingReview
                    ? "Saving..."
                    : portalReviews.myReview
                      ? "Update Portal Feedback"
                      : "Submit Portal Feedback"}
                </button>
              </form>
            )}
          </article>

          <article className="portal-feedback-card">
            <div className="portal-feedback-card__header">
              <p className="portal-feedback-card__eyebrow">Latest Reviews</p>
              <h2>Recent customer portal feedback</h2>
              <span>See what customers are saying about the actual product experience.</span>
            </div>

            <div className="portal-feedback-reviews">
              {isLoading ? (
                <div className="portal-feedback-review portal-feedback-review--empty">
                  Loading recent feedback...
                </div>
              ) : portalReviews.reviews?.length > 0 ? (
                portalReviews.reviews.map((review) => (
                  <article className="portal-feedback-review" key={review.id}>
                    <div className="portal-feedback-review__top">
                      <div>
                        <strong>{review.name || "Customer"}</strong>
                        <span>{review.role || "customer"}</span>
                      </div>
                      <div className="portal-feedback-review__meta">
                        <strong>{review.rating} / 5</strong>
                        <span>{formatDisplayDate(review.updated_at, "Not available")}</span>
                      </div>
                    </div>

                    <div className="portal-feedback-review__answers">
                      {getAnsweredReviewItems(review.review_text, feedbackQuestions).map((item) => (
                        <div
                          className="portal-feedback-review__answer"
                          key={`${review.id}-${item.question}`}
                        >
                          <span>{item.question}</span>
                          <p>{item.answer}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))
              ) : (
                <div className="portal-feedback-review portal-feedback-review--empty">
                  No portal feedback has been submitted yet.
                </div>
              )}
            </div>
          </article>
        </section>
      </div>
    </section>
  );
}
