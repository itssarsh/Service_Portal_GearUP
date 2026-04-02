import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, GET_SERVICE_RECORDS_API, UPDATE_COMPLAINT_ACTION_API, } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import { getChatRoute, getDashboardRoute, getLoginRoute, getStoredToken, } from "../../utils/session";
import { formatComplaintStatusLabel, formatDateTime, formatDisplayDate, formatStatusLabel, } from "../../utils/formatters";
import "./Complaints.css";

function getComplaintSortTime(record) {
  return new Date(
    record?.customer_complaint_updated_at ||
    record?.customer_complaint_created_at ||
    record?.created_at ||
    0
  ).getTime();
}

export default function MechanicComplaintsPage() {
  const complaintPreviewLimit = 6;
  const [serviceRecords, setServiceRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeReplyRecordId, setActiveReplyRecordId] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [savingReplyRecordId, setSavingReplyRecordId] = useState(null);
  const [isShowingAll, setIsShowingAll] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_SERVICE_RECORDS_API(),
      (response) => {
        setServiceRecords(Array.isArray(response) ? response : []);
        setIsLoading(false);
      },
      (error) => {
        toast.error(error?.response?.data?.error || "Failed to load complaints.");
        setIsLoading(false);
      },
      "",
      null,
      {},
      { skipGlobalLoader: true }
    ).catch(() => setIsLoading(false));
  }, [navigate, toast]);

  const complaints = useMemo(
    () =>
      serviceRecords
        .filter((record) => String(record.customer_complaint || "").trim())
        .sort((leftRecord, rightRecord) => getComplaintSortTime(rightRecord) - getComplaintSortTime(leftRecord)),
    [serviceRecords]
  );

  const openComplaints = complaints.filter(
    (record) => String(record.customer_complaint_status || "open").toLowerCase() === "open"
  ).length;
  const inReviewComplaints = complaints.filter(
    (record) => String(record.customer_complaint_status || "").toLowerCase() === "in_review"
  ).length;
  const resolvedComplaints = complaints.filter(
    (record) => String(record.customer_complaint_status || "").toLowerCase() === "resolved"
  ).length;
  const latestComplaint = complaints[0] || null;
  const visibleComplaints = isShowingAll
    ? complaints
    : complaints.slice(0, complaintPreviewLimit);

  const handleReplyDraftChange = (recordId, field, value) => {
    setReplyDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[recordId] || {};

      return {
        ...currentDrafts,
        [recordId]: {
          complaintStatus: currentDraft.complaintStatus || "open",
          mechanicNote: currentDraft.mechanicNote || "",
          ...currentDraft,
          [field]: value,
        },
      };
    });
  };

  const handleOpenReply = (record) => {
    setActiveReplyRecordId((currentRecordId) =>
      currentRecordId === record.id ? null : record.id
    );

    setReplyDrafts((currentDrafts) => {
      if (currentDrafts[record.id]) {
        return currentDrafts;
      }

      return {
        ...currentDrafts,
        [record.id]: {
          complaintStatus: record.customer_complaint_status || "open",
          mechanicNote: record.customer_complaint_mechanic_note || "",
        },
      };
    });
  };

  const handleReplySubmit = (record) => {
    const draft = replyDrafts[record.id] || {
      complaintStatus: record.customer_complaint_status || "open",
      mechanicNote: record.customer_complaint_mechanic_note || "",
    };

    const nextStatus = String(draft.complaintStatus || "open").trim().toLowerCase();
    const nextNote = String(draft.mechanicNote || "").trim();
    const previousStatus = String(record.customer_complaint_status || "open").trim().toLowerCase();
    const previousNote = String(record.customer_complaint_mechanic_note || "").trim();

    if (!nextNote && nextStatus === previousStatus && previousNote === nextNote) {
      toast.error("Reply likho ya complaint status update karo.");
      return;
    }

    setSavingReplyRecordId(record.id);

    makeApiCall(
      API_CALL_TYPE.PATCH_CALL,
      UPDATE_COMPLAINT_ACTION_API(record.id),
      (response) => {
        setServiceRecords((currentRecords) =>
          currentRecords.map((currentRecord) =>
            currentRecord.id === record.id ? { ...currentRecord, ...response } : currentRecord
          )
        );
        setReplyDrafts((currentDrafts) => ({
          ...currentDrafts,
          [record.id]: {
            complaintStatus: response.customer_complaint_status || nextStatus,
            mechanicNote: response.customer_complaint_mechanic_note || nextNote,
          },
        }));
        setSavingReplyRecordId(null);
        setActiveReplyRecordId(null);
        toast.success("Complaint reply sent successfully.");
      },
      (error) => {
        setSavingReplyRecordId(null);
        toast.error(error?.response?.data?.error || "Failed to send complaint reply.");
      },
      "",
      null,
      {
        complaintStatus: nextStatus,
        mechanicNote: nextNote,
      },
      { skipGlobalLoader: true }
    ).catch(() => {
      setSavingReplyRecordId(null);
    });
  };

  return (
    <section className="complaints-page">
      <div className="complaints-page__backdrop"></div>

      <div className="complaints-shell">
        <header className="complaints-hero">
          <div className="complaints-hero__top">
            <span className="complaints-hero__badge">Complaints</span>
            <div className="complaints-hero__actions">
              <Link className="complaints-hero__back" to={getDashboardRoute()}>
                Back to Dashboard
              </Link>
            </div>
          </div>

          <div className="complaints-hero__content">
            <div className="complaints-hero__intro">
              <p className="complaints-hero__eyebrow">Customer issues</p>
              <h1>Complaint resolution queue</h1>
              <p>Track open complaints, respond with clarity, and close customer issues from one workflow.</p>
            </div>

            <div className="complaints-hero__stats">
              <article className="complaints-stat">
                <span>Total cases</span>
                <strong>{complaints.length}</strong>
              </article>
              <article className="complaints-stat">
                <span>Open</span>
                <strong>{openComplaints}</strong>
              </article>
              <article className="complaints-stat">
                <span>In review</span>
                <strong>{inReviewComplaints}</strong>
              </article>
              <article className="complaints-stat">
                <span>Resolved</span>
                <strong>{resolvedComplaints}</strong>
              </article>
            </div>
          </div>

          <div className="complaints-hero__snapshot">
            <div className="complaints-hero__snapshot-label">Latest case</div>
            <strong>{latestComplaint?.service_type || "No active complaints"}</strong>
            <span>
              {latestComplaint
                ? formatDateTime(
                    latestComplaint.customer_complaint_updated_at ||
                      latestComplaint.customer_complaint_created_at,
                    "Just now"
                  )
                : "New complaint cases will appear here automatically."}
            </span>
          </div>
        </header>

        <section className="complaints-board">
          <div className="complaints-board__header">
            <div>
              <p className="complaints-board__eyebrow">Complaint queue</p>
              <h2>Customer issue cases</h2>
            </div>
            {complaints.length > complaintPreviewLimit ? (
              <div className="complaints-board__header-actions">
                <button
                  className="complaints-hero__back complaints-hero__back--button"
                  type="button"
                  onClick={() => setIsShowingAll((currentValue) => !currentValue)}
                >
                  {isShowingAll ? "Show less" : "Show all"}
                </button>
              </div>
            ) : null}
          </div>

          {complaints.length > complaintPreviewLimit ? (
            <div className="complaints-board__toolbar">
              <p>
                Showing <strong>{visibleComplaints.length}</strong> of <strong>{complaints.length}</strong> complaint cases.
              </p>
            </div>
          ) : null}

          {isLoading ? (
            <div className="complaints-empty">
              <div className="complaints-empty__badge">Loading</div>
              <h3>Preparing complaint workspace...</h3>
            </div>
          ) : complaints.length > 0 ? (
            <div className="complaints-list">
              {visibleComplaints.map((record) => {
                const isReplyOpen = activeReplyRecordId === record.id;
                const replyDraft = replyDrafts[record.id] || {
                  complaintStatus: record.customer_complaint_status || "open",
                  mechanicNote: record.customer_complaint_mechanic_note || "",
                };
                const supportChatRoute = record?.id && record?.vehicle_id
                  ? `${getChatRoute()}?${new URLSearchParams({
                    serviceRecordId: String(record.id),
                    vehicleId: String(record.vehicle_id),
                  }).toString()}`
                  : getChatRoute();

                return (
                  <article className="complaints-card" key={record.id}>
                    <div className="complaints-card__top">
                      <div>
                        <p className="complaints-card__eyebrow">
                          {formatComplaintStatusLabel(record.customer_complaint_status, "Open")}
                        </p>
                        <h3>{record.service_type || "Service complaint"}</h3>
                      </div>
                      <span className="complaints-card__time">
                        {formatDateTime(
                          record.customer_complaint_updated_at || record.customer_complaint_created_at,
                          "Just now"
                        )}
                      </span>
                    </div>

                    <div className="complaints-card__meta">
                      <div>
                        <span>Vehicle</span>
                        <strong>
                          {[record.brand, record.model, record.registration_number]
                            .filter(Boolean)
                            .join(" ") || "Linked vehicle"}
                        </strong>
                      </div>
                      <div>
                        <span>Customer</span>
                        <strong>{record.owner_name || "Customer"}</strong>
                      </div>
                      <div>
                        <span>Service status</span>
                        <strong>{formatStatusLabel(record.status, "Requested")}</strong>
                      </div>
                      <div>
                        <span>Raised on</span>
                        <strong>{formatDisplayDate(record.customer_complaint_created_at)}</strong>
                      </div>
                    </div>

                    <div className="complaints-card__block">
                      <span>Customer complaint</span>
                      <p>{record.customer_complaint}</p>
                    </div>

                    <div className="complaints-card__block">
                      <span>Workshop reply</span>
                      <p>
                        {record.customer_complaint_mechanic_note ||
                          "No workshop note yet. Open this complaint and reply to the customer."}
                      </p>
                    </div>

                    <div className="complaints-card__actions">
                      <button
                        className="complaints-card__action complaints-card__action--button"
                        type="button"
                        onClick={() => handleOpenReply(record)}
                      >
                        {isReplyOpen ? "Hide reply editor" : "Update complaint"}
                      </button>
                      <Link
                        className="complaints-card__action complaints-card__action--secondary"
                        to={supportChatRoute}
                      >
                        Open support chat
                      </Link>
                    </div>

                    {isReplyOpen ? (
                      <div className="complaints-reply-box">
                        <div className="complaints-reply-box__grid">
                          <label className="complaints-reply-box__field">
                            <span>Complaint status</span>
                            <select
                              value={replyDraft.complaintStatus}
                              onChange={(event) =>
                                handleReplyDraftChange(
                                  record.id,
                                  "complaintStatus",
                                  event.target.value
                                )
                              }
                            >
                              <option value="open">Open</option>
                              <option value="in_review">In Review</option>
                              <option value="resolved">Resolved</option>
                            </select>
                          </label>

                          <label className="complaints-reply-box__field complaints-reply-box__field--full">
                            <span>Reply to customer</span>
                            <textarea
                              placeholder="Write your complaint reply, support update, or resolution note"
                              rows={5}
                              value={replyDraft.mechanicNote}
                              onChange={(event) =>
                                handleReplyDraftChange(
                                  record.id,
                                  "mechanicNote",
                                  event.target.value
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="complaints-reply-box__actions">
                          <button
                            className="complaints-card__action complaints-card__action--button"
                            type="button"
                            onClick={() => handleReplySubmit(record)}
                            disabled={savingReplyRecordId === record.id}
                          >
                            {savingReplyRecordId === record.id ? "Sending..." : "Send Reply"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="complaints-empty">
              <div className="complaints-empty__badge">Queue clear</div>
              <h3>No customer complaints are active right now.</h3>
              <p>New complaint cases will appear here for review, response, and closure.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
