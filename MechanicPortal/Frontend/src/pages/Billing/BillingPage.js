import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, AUTO_GENERATE_BILLING_INVOICES_API, GET_BILLING_INVOICES_API, GET_BILLING_REPORT_API, GET_SERVICE_RECORDS_API, UPDATE_BILLING_PAYMENT_API, } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import { showApiError } from "../../utils/apiError";
import { getAddServiceRoute, getLoginRoute, getStoredToken, getStoredUser, } from "../../utils/session";
import { formatCurrencyInr, formatDisplayDate, formatStatusLabel, } from "../../utils/formatters";
import "./Billing.css";

const paymentMethodOptions = [
  { value: "", label: "Select method" },
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

const paymentStatusOptions = [
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

function getDateInputValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

function buildDraftFromInvoice(invoice, existingDraft) {
  if (existingDraft) {
    return existingDraft;
  }

  return {
    amountPaid:
      invoice.amount_paid !== undefined && invoice.amount_paid !== null
        ? String(invoice.amount_paid)
        : "0",
    dueDate: getDateInputValue(invoice.due_date),
    paymentMethod: invoice.payment_method || "",
    paymentStatus: invoice.payment_status || "unpaid",
    notes: invoice.notes || "",
  };
}

export default function MechanicBillingPage() {
  const billingPreviewLimit = 2;
  const monthlyPreviewLimit = 4;
  const [serviceRecords, setServiceRecords] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [report, setReport] = useState({ summary: {}, monthly: [] });
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generatingRecordIds, setGeneratingRecordIds] = useState({});
  const [savingInvoiceIds, setSavingInvoiceIds] = useState({});
  const [expandedSections, setExpandedSections] = useState({
    invoices: false,
    monthly: false,
    ready: false,
  });
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();
  const storedUser = getStoredUser();

  const syncInvoiceDrafts = (nextInvoices) => {
    setPaymentDrafts((previousDrafts) => {
      const nextDrafts = {};

      nextInvoices.forEach((invoice) => {
        nextDrafts[invoice.id] = buildDraftFromInvoice(invoice, previousDrafts[invoice.id]);
      });

      return nextDrafts;
    });
  };

  const handleSessionError = (error) => {
    showApiError(toast, error, "Failed to load billing data.");
  };

  const loadInvoices = () =>
    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_BILLING_INVOICES_API(),
      (response) => {
        setInvoices(response);
        syncInvoiceDrafts(response);
      },
      handleSessionError,
      "",
      null,
      {}
    );

  const loadServiceRecords = () =>
    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_SERVICE_RECORDS_API(),
      (response) => setServiceRecords(response),
      handleSessionError,
      "",
      null,
      {}
    );

  const loadReport = () =>
    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_BILLING_REPORT_API(),
      (response) => setReport(response),
      handleSessionError,
      "",
      null,
      {}
    );

  const refreshBillingWorkspace = ({ keepLoader = false } = {}) => {
    if (!keepLoader) {
      setIsLoading(true);
    }

    return Promise.all([loadInvoices(), loadServiceRecords(), loadReport()])
      .catch(() => {
        return undefined;
      })
      .finally(() => {
        if (!keepLoader) {
          setIsLoading(false);
        }
      });
  };

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    setIsLoading(true);

    const handleDashboardLoadError = (error) => {
      showApiError(toast, error, "Failed to load billing workspace.");
    };

    Promise.all([
      makeApiCall(
        API_CALL_TYPE.GET_CALL,
        GET_BILLING_INVOICES_API(),
        (response) => {
          setInvoices(response);
          syncInvoiceDrafts(response);
        },
        handleDashboardLoadError,
        "",
        null,
        {}
      ),
      makeApiCall(
        API_CALL_TYPE.GET_CALL,
        GET_SERVICE_RECORDS_API(),
        (response) => setServiceRecords(response),
        handleDashboardLoadError,
        "",
        null,
        {}
      ),
      makeApiCall(
        API_CALL_TYPE.GET_CALL,
        GET_BILLING_REPORT_API(),
        (response) => setReport(response),
        handleDashboardLoadError,
        "",
        null,
        {}
      ),
    ])
      .catch(() => {
        return undefined;
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [navigate, toast]);

  const handleDraftChange = (invoiceId, fieldName, value) => {
    setPaymentDrafts((previousDrafts) => ({
      ...previousDrafts,
      [invoiceId]: {
        ...previousDrafts[invoiceId],
        [fieldName]: value,
      },
    }));
  };

  const handleGenerateInvoices = (serviceRecordId = null) => {
    if (serviceRecordId) {
      setGeneratingRecordIds((previousState) => ({
        ...previousState,
        [serviceRecordId]: true,
      }));
    } else {
      setIsGeneratingAll(true);
    }

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      AUTO_GENERATE_BILLING_INVOICES_API(),
      (response) => {
        toast.success(
          response.generatedCount
            ? `Generated ${response.generatedCount} invoice${response.generatedCount > 1 ? "s" : ""}.`
            : "All eligible jobs already have invoices."
        );
        refreshBillingWorkspace({ keepLoader: true });
      },
      (error) => {
        toast.error(error.response?.data?.error || "Failed to auto-generate invoices.");
      },
      "",
      null,
      serviceRecordId ? { serviceRecordId } : {}
    )
      .catch(() => {
        return undefined;
      })
      .finally(() => {
        if (serviceRecordId) {
          setGeneratingRecordIds((previousState) => ({
            ...previousState,
            [serviceRecordId]: false,
          }));
        } else {
          setIsGeneratingAll(false);
        }
      });
  };

  const handleSavePayment = (invoiceId) => {
    const currentDraft = paymentDrafts[invoiceId];

    if (!currentDraft) {
      return;
    }

    const parsedAmountPaid =
      currentDraft.amountPaid === "" ? 0 : Number(currentDraft.amountPaid);

    if (Number.isNaN(parsedAmountPaid) || parsedAmountPaid < 0) {
      toast.error("Amount paid must be a valid positive number.");
      return;
    }

    setSavingInvoiceIds((previousState) => ({
      ...previousState,
      [invoiceId]: true,
    }));

    makeApiCall(
      API_CALL_TYPE.PUT_CALL,
      UPDATE_BILLING_PAYMENT_API(invoiceId),
      () => {
        toast.success("Payment status updated successfully.");
        setExpandedInvoiceId((currentInvoiceId) =>
          currentInvoiceId === invoiceId ? null : currentInvoiceId
        );
        refreshBillingWorkspace({ keepLoader: true });
      },
      (error) => {
        toast.error(error.response?.data?.error || "Failed to update payment status.");
      },
      "",
      null,
      {
        amountPaid: parsedAmountPaid,
        dueDate: currentDraft.dueDate || null,
        paymentMethod: currentDraft.paymentMethod || null,
        paymentStatus: currentDraft.paymentStatus || null,
        notes: currentDraft.notes?.trim() || null,
      }
    )
      .catch(() => {
        return undefined;
      })
      .finally(() => {
        setSavingInvoiceIds((previousState) => ({
          ...previousState,
          [invoiceId]: false,
        }));
      });
  };

  const completedServiceRecords = serviceRecords
    .filter((record) => record.status === "completed")
    .sort((leftRecord, rightRecord) => {
      const leftValue = new Date(leftRecord.service_date || leftRecord.created_at || 0).getTime();
      const rightValue = new Date(
        rightRecord.service_date || rightRecord.created_at || 0
      ).getTime();
      return rightValue - leftValue;
    });
  const invoicedRecordIds = new Set(invoices.map((invoice) => Number(invoice.service_record_id)));
  const readyToInvoiceRecords = completedServiceRecords.filter(
    (record) => !invoicedRecordIds.has(Number(record.id))
  );
  const summary = report.summary || {};
  const totalInvoiced = Number(summary.total_invoiced || 0);
  const totalCollected = Number(summary.total_collected || 0);
  const outstandingAmount = Number(summary.outstanding_amount || 0);
  const overdueAmount = Number(summary.overdue_amount || 0);
  const collectionRate = totalInvoiced ? Math.round((totalCollected / totalInvoiced) * 100) : 0;
  const monthlyData = report.monthly || [];
  const maxMonthlyAmount = Math.max(
    1,
    ...monthlyData.map((item) =>
      Math.max(Number(item.invoiced_amount || 0), Number(item.collected_amount || 0))
    )
  );
  const visibleReadyToInvoiceRecords = expandedSections.ready
    ? readyToInvoiceRecords
    : readyToInvoiceRecords.slice(0, billingPreviewLimit);
  const visibleInvoices = expandedSections.invoices
    ? invoices
    : invoices.slice(0, billingPreviewLimit);
  const visibleMonthlyData = expandedSections.monthly
    ? monthlyData
    : monthlyData.slice(0, monthlyPreviewLimit);

  const toggleSectionExpansion = (sectionKey) => {
    setExpandedSections((currentSections) => ({
      ...currentSections,
      [sectionKey]: !currentSections[sectionKey],
    }));
  };

  const toggleInvoiceEditor = (invoiceId) => {
    setExpandedInvoiceId((currentInvoiceId) =>
      currentInvoiceId === invoiceId ? null : invoiceId
    );
  };

  return (
    <section className="billing-page">
      <div className="billing-page__backdrop"></div>

      <div className="billing-layout">
        <header className="billing-hero">
          <div className="billing-hero__content">
            <div className="billing-hero__summary-header">
              <div>
                <p className="billing-section__eyebrow">Finance summary</p>
                <h2>Live revenue overview</h2>
              </div>
            </div>

            <div className="billing-summary-grid billing-summary-grid--hero">
              <article className="billing-summary-card billing-summary-card--warm">
                <span>Total invoiced</span>
                <strong>{formatCurrencyInr(totalInvoiced)}</strong>
              </article>
              <article className="billing-summary-card billing-summary-card--cool">
                <span>Total collected</span>
                <strong>{formatCurrencyInr(totalCollected)}</strong>
              </article>
              <article className="billing-summary-card billing-summary-card--soft">
                <span>Outstanding dues</span>
                <strong>{formatCurrencyInr(outstandingAmount)}</strong>
              </article>
              <article className="billing-summary-card billing-summary-card--alert">
                <span>Overdue amount</span>
                <strong>{formatCurrencyInr(overdueAmount)}</strong>
              </article>
            </div>

            <div className="billing-metrics-grid billing-metrics-grid--hero">
              <article className="billing-metric">
                <span>Paid invoices</span>
                <strong>{summary.paid_invoices || 0}</strong>
              </article>
              <article className="billing-metric">
                <span>Partially paid</span>
                <strong>{summary.partially_paid_invoices || 0}</strong>
              </article>
              <article className="billing-metric">
                <span>Pending or overdue</span>
                <strong>{summary.unpaid_invoices || 0}</strong>
              </article>
              <article className="billing-metric">
                <span>Ready to invoice</span>
                <strong>{readyToInvoiceRecords.length}</strong>
              </article>
            </div>

            <div className="billing-hero__actions">
              <button
                className="billing-button billing-button--primary"
                type="button"
                onClick={() => handleGenerateInvoices()}
                disabled={isGeneratingAll}
              >
                {isGeneratingAll ? "Generating..." : "Auto Generate Invoices"}
              </button>
              <Link className="billing-button billing-button--secondary" to={getAddServiceRoute()}>
                Add Service
              </Link>
            </div>
          </div>

          <aside className="billing-hero__panel">
            <span className="billing-hero__panel-label">Workshop finance snapshot</span>
            <div className="billing-hero__panel-grid">
              <article className="billing-hero__panel-card">
                <span>Invoices</span>
                <strong>{summary.invoice_count || 0}</strong>
              </article>
              <article className="billing-hero__panel-card">
                <span>Outstanding</span>
                <strong>{formatCurrencyInr(outstandingAmount)}</strong>
              </article>
              <article className="billing-hero__panel-card">
                <span>Collection rate</span>
                <strong>{collectionRate}%</strong>
              </article>
            </div>
            <div className="billing-hero__panel-foot">
              <span>Signed in as</span>
              <strong>{storedUser?.name || "Mechanic"}</strong>
            </div>
          </aside>
        </header>

        <section className="billing-section">
          <div className="billing-section__header">
            <div>
              <p className="billing-section__eyebrow">Invoice queue</p>
              <h2>Completed jobs pending invoice creation</h2>
            </div>
          </div>

          {!isLoading && readyToInvoiceRecords.length > billingPreviewLimit ? (
            <div className="billing-section__toolbar">
              <p>
                Showing <strong>{visibleReadyToInvoiceRecords.length}</strong> of{" "}
                <strong>{readyToInvoiceRecords.length}</strong> ready jobs.
              </p>
              <button
                className="billing-button billing-button--ghost"
                type="button"
                onClick={() => toggleSectionExpansion("ready")}
              >
                {expandedSections.ready ? "Show less" : "Show all"}
              </button>
            </div>
          ) : null}

          {isLoading ? (
            <div className="billing-empty-state">
              <div className="billing-empty-state__badge">Loading</div>
              <h3>Preparing the finance workspace...</h3>
            </div>
          ) : readyToInvoiceRecords.length ? (
            <div className="billing-ready-grid">
              {visibleReadyToInvoiceRecords.map((record) => (
                <article className="billing-ready-card" key={record.id}>
                  <span className="billing-ready-card__tag">
                    {formatStatusLabel(record.status, "Completed")}
                  </span>
                  <h3>{record.service_type}</h3>
                  <p>
                    {record.owner_name} · {record.registration_number}
                  </p>
                  <div className="billing-ready-card__meta">
                    <span>{record.brand} {record.model}</span>
                    <strong>{formatCurrencyInr(record.amount)}</strong>
                  </div>
                  <div className="billing-ready-card__meta">
                    <span>Service date</span>
                    <strong>{formatDisplayDate(record.service_date)}</strong>
                  </div>
                  <button
                    className="billing-button billing-button--primary billing-button--full"
                    type="button"
                    onClick={() => handleGenerateInvoices(record.id)}
                    disabled={Boolean(generatingRecordIds[record.id])}
                  >
                    {generatingRecordIds[record.id] ? "Generating..." : "Generate Invoice"}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="billing-empty-state">
              <div className="billing-empty-state__badge">All clear</div>
              <h3>No completed jobs are waiting for invoice generation.</h3>
              <p>
                New invoices are created automatically for completed jobs, and you can
                still run a bulk sync any time.
              </p>
            </div>
          )}
        </section>

        <section className="billing-section">
          <div className="billing-section__header">
            <div>
              <p className="billing-section__eyebrow">Collections</p>
              <h2>Invoices and payment updates</h2>
            </div>
          </div>

          {!isLoading && invoices.length > billingPreviewLimit ? (
            <div className="billing-section__toolbar">
              <p>
                Showing <strong>{visibleInvoices.length}</strong> of <strong>{invoices.length}</strong> invoices.
              </p>
              <button
                className="billing-button billing-button--ghost"
                type="button"
                onClick={() => toggleSectionExpansion("invoices")}
              >
                {expandedSections.invoices ? "Show less" : "Show all"}
              </button>
            </div>
          ) : null}

          {isLoading ? (
            <div className="billing-empty-state">
              <div className="billing-empty-state__badge">Loading</div>
              <h3>Fetching invoices...</h3>
            </div>
          ) : invoices.length ? (
            <div className="billing-invoice-list">
              {visibleInvoices.map((invoice) => {
                const draft = paymentDrafts[invoice.id] || buildDraftFromInvoice(invoice);
                const outstanding = Math.max(
                  Number(invoice.amount_due || 0) - Number(invoice.amount_paid || 0),
                  0
                );
                const isEditorOpen = expandedInvoiceId === invoice.id;

                return (
                  <article className="billing-invoice-card" key={invoice.id}>
                    <div className="billing-invoice-card__header">
                      <div>
                        <span className="billing-invoice-card__tag">{invoice.invoice_number}</span>
                        <h3>
                          {invoice.owner_name} · {invoice.registration_number}
                        </h3>
                        <p>
                          {invoice.service_type} · {invoice.brand} {invoice.model}
                        </p>
                      </div>
                      <div className="billing-invoice-card__status">
                        <span>Status</span>
                        <strong>{formatStatusLabel(invoice.payment_status, "Unpaid")}</strong>
                      </div>
                    </div>

                    <div className="billing-invoice-card__stats">
                      <div className="billing-invoice-card__stat">
                        <span>Amount due</span>
                        <strong>{formatCurrencyInr(invoice.amount_due)}</strong>
                      </div>
                      <div className="billing-invoice-card__stat">
                        <span>Amount paid</span>
                        <strong>{formatCurrencyInr(invoice.amount_paid)}</strong>
                      </div>
                      <div className="billing-invoice-card__stat">
                        <span>Outstanding</span>
                        <strong>{formatCurrencyInr(outstanding)}</strong>
                      </div>
                      <div className="billing-invoice-card__stat">
                        <span>Due date</span>
                        <strong>{formatDisplayDate(invoice.due_date)}</strong>
                      </div>
                    </div>

                    <div className="billing-invoice-card__actions">
                      <button
                        className="billing-button billing-button--secondary"
                        type="button"
                        onClick={() => toggleInvoiceEditor(invoice.id)}
                      >
                        {isEditorOpen ? "Hide payment editor" : "Update payment"}
                      </button>
                      <button
                        className="billing-button billing-button--ghost"
                        type="button"
                        onClick={() => {
                          setPaymentDrafts((previousDrafts) => ({
                            ...previousDrafts,
                            [invoice.id]: {
                              ...draft,
                              amountPaid: String(invoice.amount_due || 0),
                              paymentStatus: "paid",
                            },
                          }));
                          setExpandedInvoiceId(invoice.id);
                        }}
                      >
                        Mark as Paid
                      </button>
                    </div>

                    {isEditorOpen ? (
                      <div className="billing-invoice-card__editor">
                        <div className="billing-form-grid">
                          <label className="billing-field">
                            <span>Amount Paid</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.amountPaid}
                              onChange={(event) =>
                                handleDraftChange(invoice.id, "amountPaid", event.target.value)
                              }
                            />
                          </label>

                          <label className="billing-field">
                            <span>Due Date</span>
                            <input
                              type="date"
                              value={draft.dueDate}
                              onChange={(event) =>
                                handleDraftChange(invoice.id, "dueDate", event.target.value)
                              }
                            />
                          </label>

                          <label className="billing-field">
                            <span>Payment Method</span>
                            <select
                              value={draft.paymentMethod}
                              onChange={(event) =>
                                handleDraftChange(invoice.id, "paymentMethod", event.target.value)
                              }
                            >
                              {paymentMethodOptions.map((option) => (
                                <option key={option.value || "blank"} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="billing-field">
                            <span>Payment Status</span>
                            <select
                              value={draft.paymentStatus}
                              onChange={(event) =>
                                handleDraftChange(invoice.id, "paymentStatus", event.target.value)
                              }
                            >
                              {paymentStatusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="billing-field billing-field--wide">
                            <span>Notes</span>
                            <textarea
                              rows="3"
                              placeholder="Add payment notes or reference details"
                              value={draft.notes}
                              onChange={(event) =>
                                handleDraftChange(invoice.id, "notes", event.target.value)
                              }
                            />
                          </label>
                        </div>

                        <div className="billing-invoice-card__actions billing-invoice-card__actions--editor">
                          <button
                            className="billing-button billing-button--primary"
                            type="button"
                            onClick={() => handleSavePayment(invoice.id)}
                            disabled={Boolean(savingInvoiceIds[invoice.id])}
                          >
                            {savingInvoiceIds[invoice.id] ? "Saving..." : "Save Payment Update"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="billing-empty-state">
              <div className="billing-empty-state__badge">No invoices</div>
              <h3>No invoices have been created yet.</h3>
              <p>Complete a service job and run auto invoice generation to start tracking billing.</p>
            </div>
          )}
        </section>

        <section className="billing-section">
          <div className="billing-section__header">
            <div>
              <p className="billing-section__eyebrow">Monthly view</p>
              <h2>Earnings trend</h2>
            </div>
          </div>

          {monthlyData.length > monthlyPreviewLimit ? (
            <div className="billing-section__toolbar">
              <p>
                Showing <strong>{visibleMonthlyData.length}</strong> of <strong>{monthlyData.length}</strong> monthly snapshots.
              </p>
              <button
                className="billing-button billing-button--ghost"
                type="button"
                onClick={() => toggleSectionExpansion("monthly")}
              >
                {expandedSections.monthly ? "Show less" : "Show all"}
              </button>
            </div>
          ) : null}

          {visibleMonthlyData.length ? (
            <div className="billing-chart">
              {visibleMonthlyData.map((item) => {
                const invoicedAmount = Number(item.invoiced_amount || 0);
                const collectedAmount = Number(item.collected_amount || 0);

                return (
                  <div className="billing-chart__row" key={item.month}>
                    <div className="billing-chart__label">{item.label}</div>
                    <div className="billing-chart__bars">
                      <div className="billing-chart__track">
                        <div
                          className="billing-chart__bar billing-chart__bar--invoiced"
                          style={{ width: `${(invoicedAmount / maxMonthlyAmount) * 100}%` }}
                        ></div>
                      </div>
                      <div className="billing-chart__track">
                        <div
                          className="billing-chart__bar billing-chart__bar--collected"
                          style={{ width: `${(collectedAmount / maxMonthlyAmount) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="billing-chart__values">
                      <span>Invoiced {formatCurrencyInr(invoicedAmount)}</span>
                      <span>Collected {formatCurrencyInr(collectedAmount)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="billing-empty-state">
              <div className="billing-empty-state__badge">No report data</div>
              <h3>Monthly earnings will appear here after invoices are created.</h3>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
