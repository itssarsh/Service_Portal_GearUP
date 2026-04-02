import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, PORTAL_REVIEWS_API } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import { showApiError } from "../../utils/apiError";
import {
  getDashboardRoute,
  getLoginRoute,
  getStoredToken,
} from "../../utils/session";
import { formatDisplayDate } from "../../utils/formatters";
import "./Feedback.css";

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
  const firstAnswer = (questions || []).map((field) => answers[field.key]).find((answer) =>
    String(answer || "").trim()
  );

  return firstAnswer || String(reviewText || "").trim() || "No Feedback.";
}

function getAnsweredReviewItems(reviewText, questions) {
  const answers = parseReviewAnswers(reviewText, questions);
  const reviewItems = (questions || []).map((field) => ({
    question: field.question,
    answer: answers[field.key],
  })).filter((item) => String(item.answer || "").trim());

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

export default function MechanicFeedbackPage() {
  const reviewPreviewLimit = 3;
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
  const [isShowingAllReviews, setIsShowingAllReviews] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      PORTAL_REVIEWS_API(),
      (response) => {
        const nextQuestions = response?.questions || [];
        const nextAnswers = parseReviewAnswers(response?.myReview?.review_text, nextQuestions);

        setFeedbackQuestions(nextQuestions);
        setPortalReviews(response);
        setReviewForm({
          rating: response?.myReview?.rating || 5,
          answers: nextAnswers,
        });
      },
      (error) => {
        showApiError(toast, error, "Failed to load portal feedback.");
      },
      "",
      null,
      {}
    ).catch(() => undefined);
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
      PORTAL_REVIEWS_API(),
      (response) => {
        const nextQuestions = response?.questions || [];
        const nextAnswers = parseReviewAnswers(response?.myReview?.review_text, nextQuestions);

        setFeedbackQuestions(nextQuestions);
        setPortalReviews(response);
        setReviewForm({
          rating: response?.myReview?.rating || reviewForm.rating,
          answers: nextAnswers,
        });
        toast.success("Portal feedback saved successfully.");
      },
      (error) => {
        showApiError(toast, error, "Failed to save portal feedback.");
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

  const visibleReviews = isShowingAllReviews
    ? portalReviews.reviews || []
    : (portalReviews.reviews || []).slice(0, reviewPreviewLimit);

  return (
    <section className="feedback-page">
      <div className="feedback-page__backdrop"></div>

      <div className="feedback-container">
        <header className="feedback-hero">
          <div className="feedback-hero__content">
            <p className="feedback-hero__eyebrow">Portal feedback</p>
            <h1>Portal feedback workspace</h1>
            <p className="feedback-hero__description">
              Share practical feedback on workflow quality, speed, and daily usability.
            </p>

            <div className="feedback-hero__actions">
              <Link className="feedback-hero__button" to={getDashboardRoute()}>
                Back to dashboard
              </Link>
            </div>
          </div>

          <aside className="feedback-summary">
            <div className="feedback-summary__header">
              <span className="feedback-summary__eyebrow">Portal feedback snapshot</span>
            </div>
            <div className="feedback-summary__metrics">
              <div className="feedback-summary__metric">
                <span>Average rating</span>
                <strong>{Number(portalReviews.summary?.average_rating || 0).toFixed(1)} / 5</strong>
              </div>
              <div className="feedback-summary__metric">
                <span>Total reviews</span>
                <strong>{portalReviews.summary?.total_reviews || 0}</strong>
              </div>
              {/* <div className="feedback-summary__metric feedback-summary__metric--latest">
                <span>Latest feedback</span>
                <strong>{latestReview ? getReviewPreview(latestReview.review_text, feedbackQuestions) : "No feedback shared yet."}</strong>
              </div> */}
            </div>
          </aside>
        </header>

        <section className="feedback-grid">
          <article className="feedback-card feedback-card--form">
            <div className="feedback-card__header">
              <p className="feedback-card__eyebrow">Your review</p>
              <h2>Submit a structured review</h2>
              <span>Use this form to rate the portal and answer the current feedback prompts.</span>
            </div>

            <form className="feedback-form" onSubmit={handleReviewSubmit}>
              <div className="feedback-form__stars">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    aria-label={`${value} star rating`}
                    className={`feedback-form__star${
                      Number(reviewForm.rating) === value ? " feedback-form__star--active" : ""
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

              <div className="feedback-form__rating-label">
                Selected rating: <strong>{reviewForm.rating} / 5</strong>
              </div>

              {feedbackQuestions.length > 0 ? (
                feedbackQuestions.map((field, index) => (
                  <label className="feedback-form__field" htmlFor={field.key} key={field.key}>
                    <span>
                      Q{index + 1}. {field.question}
                    </span>
                    <textarea
                      className="feedback-form__textarea"
                      id={field.key}
                      onChange={(event) => handleAnswerChange(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      rows={4}
                      value={reviewForm.answers[field.key] || ""}
                    />
                  </label>
                ))
              ) : (
                <div className="feedback-form__empty">No feedback questions are available right now.</div>
              )}

              <button
                className="feedback-form__submit"
                disabled={feedbackQuestions.length === 0 || isSavingReview}
                type="submit"
              >
                {isSavingReview
                  ? "Saving..."
                  : portalReviews.myReview
                    ? "Update Review"
                    : "Submit Review"}
              </button>
            </form>
          </article>

          <article className="feedback-card">
            <div className="feedback-card__header">
              <p className="feedback-card__eyebrow">Latest reviews</p>
              <h2>Recent portal feedback</h2>
              <span>Recent operator reviews and product observations.</span>
            </div>

            {portalReviews.reviews?.length > reviewPreviewLimit ? (
              <div className="feedback-card__toolbar">
                <p>
                  Showing <strong>{visibleReviews.length}</strong> of <strong>{portalReviews.reviews.length}</strong> reviews.
                </p>
                <button
                  className="feedback-card__toolbar-button"
                  type="button"
                  onClick={() => setIsShowingAllReviews((currentValue) => !currentValue)}
                >
                  {isShowingAllReviews ? "Show less" : "Show all"}
                </button>
              </div>
            ) : null}

            <div className="feedback-reviews">
              {portalReviews.reviews?.length > 0 ? (
                visibleReviews.map((review) => (
                  <article className="feedback-review" key={review.id}>
                    <div className="feedback-review__top">
                      <div>
                        <strong>{review.name || "User"}</strong>
                        <span>{review.role || "mechanic"}</span>
                      </div>
                      <div className="feedback-review__meta">
                        <strong>{review.rating} / 5</strong>
                        <span>{formatDisplayDate(review.updated_at, "Not available")}</span>
                      </div>
                    </div>

                    <div className="feedback-review__answers">
                      {getAnsweredReviewItems(review.review_text, feedbackQuestions).map((item) => (
                        <div className="feedback-review__answer" key={`${review.id}-${item.question}`}>
                          <span>{item.question}</span>
                          <p>{item.answer}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))
              ) : (
                <div className="feedback-review feedback-review--empty">No portal feedback yet.</div>
              )}
            </div>
          </article>
        </section>
      </div>
    </section>
  );
}
