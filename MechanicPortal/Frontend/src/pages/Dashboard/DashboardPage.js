import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, GET_NOTIFICATIONS_API, GET_SERVICE_RECORDS_API, GET_VEHICLES_API, PROFILE_API, UPDATE_VEHICLE_NOTES_API, } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import { normalizePhoneNumber, normalizeWhitespace } from "../../utils/normalize";
import { showApiError } from "../../utils/apiError";
import { getAddServiceRoute, getAddVehicleRoute, getLoginRoute, getStoredToken, } from "../../utils/session";
import { formatComplaintStatusLabel, formatCurrencyInr, formatDisplayDate, formatDisplayTime, getDateValue, formatStatusLabel, } from "../../utils/formatters";
import "./Dashboard.css";

export default function MechanicDashboardPage() {
  const dashboardPreviewLimit = 2;
  const [vehicles, setVehicles] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [user, setUser] = useState(null);
  const [customerNoteDrafts, setCustomerNoteDrafts] = useState({});
  const [savingCustomerNotes, setSavingCustomerNotes] = useState({});
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState("jobs");
  const [expandedWorkspaceTabs, setExpandedWorkspaceTabs] = useState({ customers: false, jobs: false, });
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const actionMenuRef = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    const handleDashboardLoadError = (error) => {
      showApiError(toast, error, "Failed to load dashboard data.");
    };

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_VEHICLES_API(),
      (response) => setVehicles(response),
      handleDashboardLoadError,
      "",
      null,
      {}
    ).catch(() => undefined);

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_SERVICE_RECORDS_API(),
      (response) => setServiceRecords(response),
      handleDashboardLoadError,
      "",
      null,
      {}
    ).catch(() => undefined);

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      PROFILE_API(),
      (response) => setUser(response),
      handleDashboardLoadError,
      "",
      null,
      {}
    ).catch(() => undefined);

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_NOTIFICATIONS_API(),
      (response) => setNotifications(Array.isArray(response) ? response : []),
      () => undefined,
      "",
      null,
      { limit: 100 },
      { skipGlobalLoader: true }
    ).catch(() => undefined);

    const notificationsIntervalId = window.setInterval(() => {
      makeApiCall(
        API_CALL_TYPE.GET_CALL,
        GET_NOTIFICATIONS_API(),
        (response) => setNotifications(Array.isArray(response) ? response : []),
        () => undefined,
        "",
        null,
        { limit: 100 },
        { skipGlobalLoader: true }
      ).catch(() => undefined);
    }, 15000);

    return () => {
      window.clearInterval(notificationsIntervalId);
    };
  }, [navigate, toast]);

  useEffect(() => {
    if (!isActionMenuOpen) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (!actionMenuRef.current?.contains(event.target)) {
        setIsActionMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsActionMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isActionMenuOpen]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();

  const getDateKey = (value) => {
    const parsedDate = getDateValue(value);

    if (!parsedDate) {
      return "";
    }

    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
    const day = String(parsedDate.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const getJobTrackingDate = (record) =>
    getDateValue(record.booking_date) ||
    getDateValue(record.service_date) ||
    getDateValue(record.created_at);

  const isActiveJob = (record) =>
    record.status === "requested" ||
    record.status === "accepted" ||
    record.status === "in_progress";
  const isCompletedJob = (record) => record.status === "completed";

  const todaysJobs = serviceRecords.filter((record) => {
    const jobDate = getJobTrackingDate(record);
    return jobDate?.getTime() === todayTimestamp;
  });

  const completedJobs = serviceRecords.filter(isCompletedJob).length;
  const activeJobs = serviceRecords.filter(isActiveJob).length;
  const totalJobs = serviceRecords.length;
  const unreadNotifications = notifications.filter((notification) => !notification.is_read);
  const completionRate = totalJobs ? Math.round((completedJobs / totalJobs) * 100) : 0;
  const totalRevenue = serviceRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const totalEarnings = serviceRecords
    .filter(isCompletedJob)
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const todaysActiveJobs = todaysJobs.filter(isActiveJob).length;
  const todaysCompletedJobs = todaysJobs.filter(isCompletedJob).length;
  const activeWorkloadRecords = serviceRecords.filter((record) => record.status !== "completed");
  const scheduleBucketsMap = new Map();
  activeWorkloadRecords.forEach((record) => {
    const scheduleDate = getJobTrackingDate(record);

    if (!scheduleDate) {
      return;
    }
    const normalizedDate = getDateKey(scheduleDate);
    const slotLabel = record.booking_time_slot || "Flexible slot";
    const bucketKey = `${normalizedDate}:${slotLabel}`;
    const estimatedHours = Number(record.estimated_hours || 1);
    if (!scheduleBucketsMap.has(bucketKey)) {
      scheduleBucketsMap.set(bucketKey, {
        key: bucketKey,
        date: normalizedDate,
        slot: slotLabel,
        totalEstimatedHours: 0,
      });
    }
    const bucket = scheduleBucketsMap.get(bucketKey);
    bucket.totalEstimatedHours += estimatedHours;
  });

  const scheduleBuckets = Array.from(scheduleBucketsMap.values()).sort((leftBucket, rightBucket) => {
    const leftDate = getDateValue(leftBucket.date)?.getTime() || Number.MAX_SAFE_INTEGER;
    const rightDate = getDateValue(rightBucket.date)?.getTime() || Number.MAX_SAFE_INTEGER;
    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }
    return String(leftBucket.slot).localeCompare(String(rightBucket.slot));
  });

  const dailyWorkloadMap = new Map();
  scheduleBuckets.forEach((bucket) => {
    dailyWorkloadMap.set(
      bucket.date,
      (dailyWorkloadMap.get(bucket.date) || 0) + Number(bucket.totalEstimatedHours || 0)
    );
  });

  const getCustomerKey = (name, phone) =>
    normalizePhoneNumber(phone || "", 15) || String(name || "").trim().toLowerCase();
  const getJobChecklistItems = (record) => [
    { label: "Vehicle linked", done: Boolean(record.vehicle_id) },
    { label: "Complaint logged", done: Boolean(record.complaint?.trim()) },
    { label: "Customer complaint received", done: Boolean(record.customer_complaint?.trim()) },
    { label: "Work summary updated", done: Boolean(record.work_summary?.trim()) },
    { label: "Billing captured", done: Number(record.amount || 0) > 0 },
  ];

  // const getStatusStage = (status) => {
  //   if (status === "accepted") {
  //     return 1;
  //   }

  //   if (status === "in_progress") {
  //     return 2;
  //   }

  //   if (status === "completed") {
  //     return 3;
  //   }

  //   return 0;
  // };

  const customerMap = new Map();

  vehicles.forEach((vehicle) => {
    const customerKey = getCustomerKey(vehicle.owner_name, vehicle.owner_phone);

    if (!customerKey) {
      return;
    }

    if (!customerMap.has(customerKey)) {
      customerMap.set(customerKey, {
        key: customerKey,
        name: vehicle.owner_name || "Customer",
        phone: vehicle.owner_phone || "Not available",
        vehicles: [],
        records: [],
      });
    }

    customerMap.get(customerKey).vehicles.push(vehicle);
  });

  serviceRecords.forEach((record) => {
    const customerKey = getCustomerKey(record.owner_name, record.owner_phone);

    if (!customerKey) {
      return;
    }

    if (!customerMap.has(customerKey)) {
      customerMap.set(customerKey, {
        key: customerKey,
        name: record.owner_name || "Customer",
        phone: record.owner_phone || "Not available",
        vehicles: [],
        records: [],
      });
    }

    customerMap.get(customerKey).records.push(record);
  });

  const customerSummaries = Array.from(customerMap.values())
    .map((customer) => {
      const noteSourceVehicle =
        customer.vehicles.find((vehicle) => vehicle.notes?.trim()) ||
        customer.vehicles[0] ||
        null;
      const previousServices = customer.records.slice(0, dashboardPreviewLimit);
      const lastServiceDate = previousServices[0]
        ? getJobTrackingDate(previousServices[0])
        : null;
      const totalCustomerSpend = customer.records.reduce(
        (sum, record) => sum + Number(record.amount || 0),
        0
      );

      return {
        ...customer,
        noteVehicleId: noteSourceVehicle?.id || null,
        notes: noteSourceVehicle?.notes || "",
        previousServices,
        lastServiceDate,
        totalCustomerSpend,
        vehicleCount: customer.vehicles.length,
        serviceCount: customer.records.length,
        isRepeatCustomer: customer.records.length > 1 || customer.vehicles.length > 1,
      };
    })
    .sort((leftCustomer, rightCustomer) => {
      if (leftCustomer.isRepeatCustomer !== rightCustomer.isRepeatCustomer) {
        return Number(rightCustomer.isRepeatCustomer) - Number(leftCustomer.isRepeatCustomer);
      }

      if (rightCustomer.serviceCount !== leftCustomer.serviceCount) {
        return rightCustomer.serviceCount - leftCustomer.serviceCount;
      }

      return (
        (rightCustomer.lastServiceDate?.getTime() || 0) -
        (leftCustomer.lastServiceDate?.getTime() || 0)
      );
    });

  const workspaceTabs = [
    {
      key: "jobs",
      label: "Job Cards",
      count: serviceRecords.length,
      actionLabel: "Create Job Card",
      actionRoute: getAddServiceRoute(),
      itemLabel: "job cards",
    },
    {
      key: "customers",
      label: "Customers",
      count: customerSummaries.length,
      actionLabel: "Add Customer Vehicle",
      actionRoute: getAddVehicleRoute(),
      itemLabel: "customers",
    },
  ];

  const activeWorkspaceTabConfig = workspaceTabs.find((tab) => tab.key === activeWorkspaceTab);
  const visibleCustomerSummaries = expandedWorkspaceTabs.customers
    ? customerSummaries
    : customerSummaries.slice(0, dashboardPreviewLimit);
  const visibleServiceRecords = expandedWorkspaceTabs.jobs
    ? serviceRecords
    : serviceRecords.slice(0, dashboardPreviewLimit);
  const isCustomerPreviewExpanded = expandedWorkspaceTabs.customers;
  const isJobPreviewExpanded = expandedWorkspaceTabs.jobs;

  const handleCustomerNoteChange = (customerKey, value) => {
    setCustomerNoteDrafts((previousDrafts) => ({
      ...previousDrafts,
      [customerKey]: value,
    }));
  };

  const toggleWorkspaceTabExpansion = (tabKey) => {
    setExpandedWorkspaceTabs((previousTabs) => ({
      ...previousTabs,
      [tabKey]: !previousTabs[tabKey],
    }));
  };

  const handleCustomerNoteSave = (customer) => {
    if (!customer.noteVehicleId) {
      toast.error("Register a vehicle for this customer before saving notes.");
      return;
    }

    const nextNoteValue = normalizeWhitespace(
      customerNoteDrafts[customer.key] ?? customer.notes ?? ""
    );

    setSavingCustomerNotes((previousState) => ({
      ...previousState,
      [customer.key]: true,
    }));

    makeApiCall(API_CALL_TYPE.PUT_CALL, UPDATE_VEHICLE_NOTES_API(customer.noteVehicleId), (updatedVehicle) => {
      setVehicles((previousVehicles) =>
        previousVehicles.map((vehicle) =>
          vehicle.id === updatedVehicle.id ? { ...vehicle, ...updatedVehicle } : vehicle
        )
      );
      setCustomerNoteDrafts((previousDrafts) => ({
        ...previousDrafts,
        [customer.key]: updatedVehicle.notes || "",
      }));
      setSavingCustomerNotes((previousState) => ({
        ...previousState,
        [customer.key]: false,
      }));
      toast.success("Customer notes saved successfully.");
    },
      (error) => {
        setSavingCustomerNotes((previousState) => ({
          ...previousState,
          [customer.key]: false,
        }));
        toast.error(error.response?.data?.error || "Failed to save customer notes.");
      },
      "",
      null,
      { notes: nextNoteValue }
    ).catch(() => undefined);
  };

  return (
    <section className="dashboard-page">
      <div className="dashboard-page__backdrop"></div>
      <div className="dashboard-container">
        <header className="dashboard-hero">
          <div className="dashboard-hero__content">
            <div className="dashboard-hero__summary-header">
              <div>
                <p className="dashboard-section__eyebrow">Operational snapshot</p>
                <h2>Daily throughput and execution health</h2>
                <span>
                  Keep today&apos;s jobs, live status updates, and earnings visible at a glance.
                </span>
              </div>
            </div>

            <div className="dashboard-overview-grid dashboard-overview-grid--hero">
              <article className="dashboard-overview-metric dashboard-overview-metric--today">
                <span className="dashboard-overview-metric__label">Today&apos;s jobs</span>
                <strong>{todaysJobs.length}</strong>
                <p>
                  {todaysActiveJobs} active and {todaysCompletedJobs} completed jobs
                  mapped to today&apos;s schedule.
                </p>
              </article>

              <article className="dashboard-overview-metric dashboard-overview-metric--work">
                <span className="dashboard-overview-metric__label">Active / completed work</span>
                <strong>{activeJobs} / {completedJobs}</strong>
                <p>{completionRate}% of all recorded jobs have already been closed.</p>
              </article>

              <article className="dashboard-overview-metric dashboard-overview-metric--earnings">
                <span className="dashboard-overview-metric__label">Total earnings</span>
                <strong>{formatCurrencyInr(totalEarnings)}</strong>
                <p>
                  Completed jobs account for {formatCurrencyInr(totalEarnings)}.
                  Overall recorded service value is {formatCurrencyInr(totalRevenue)}.
                </p>
              </article>

              <article className="dashboard-overview-spotlight">
                <div className="dashboard-overview-spotlight__top">
                  <div>
                    <span className="dashboard-overview-metric__label">Today&apos;s workboard</span>
                    <h3>Useful for quick daily follow-up</h3>
                  </div>
                  <strong>{formatDisplayDate(today)}</strong>
                </div>

                {todaysJobs.length > 0 ? (
                  <div className="dashboard-overview-spotlight__list">
                    {todaysJobs.slice(0, dashboardPreviewLimit).map((record) => (
                      <article className="dashboard-overview-job" key={record.id}>
                        <div>
                          <h4>{record.brand} {record.model}</h4>
                          <p>
                            {record.service_type} for {record.registration_number}
                          </p>
                        </div>
                        <span className="dashboard-overview-job__status">
                          {formatStatusLabel(record.status, "Requested")}
                        </span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="dashboard-overview-spotlight__empty">
                    No jobs are mapped to today yet. New service entries created today
                    will start showing up here automatically.
                  </p>
                )}
              </article>
            </div>
          </div>

          <div className="dashboard-hero__panel">
            <div className="dashboard-hero__panel-label">Service Snapshot</div>
            <div className="dashboard-hero__stats">
              <article className="dashboard-stat">
                <span>Registered Vehicles</span>
                <strong>{vehicles.length}</strong>
              </article>
              <article className="dashboard-stat">
                <span>Active Jobs</span>
                <strong>{activeJobs}</strong>
              </article>
              <article className="dashboard-stat">
                <span>Completed Jobs</span>
                <strong>{completedJobs}</strong>
              </article>
              <article className="dashboard-stat">
                <span>Unread Customer Activity</span>
                <strong>{unreadNotifications.length}</strong>
              </article>
            </div>
            <div className="dashboard-hero__foot">
              <span>Logged in as</span>
              <strong>{user?.name || "Mechanic"}</strong>
            </div>
          </div>
        </header>

        <section className="dashboard-section dashboard-section--workspace">
          <div className="dashboard-section__header">
            <div>
              <p className="dashboard-section__eyebrow">Record previews</p>
              <h2>Quick access to customers and active work items</h2>
              <span>
                Switch between job cards and customers from tabs. Only a limited
                preview is shown first, and you can open the full list only when needed.
              </span>
            </div>
            <Link className="dashboard-section__link" to={activeWorkspaceTabConfig?.actionRoute}>
              {activeWorkspaceTabConfig?.actionLabel}
            </Link>
          </div>

          <div className="dashboard-workspace-tabs" role="tablist" aria-label="Dashboard record tabs">
            {workspaceTabs.map((tab) => (
              <button
                key={tab.key}
                aria-selected={activeWorkspaceTab === tab.key}
                className={`dashboard-workspace-tab${activeWorkspaceTab === tab.key ? " dashboard-workspace-tab--active" : ""
                  }`}
                onClick={() => setActiveWorkspaceTab(tab.key)}
                role="tab"
                type="button"
              >
                <span>{tab.label}</span>
                <strong>{tab.count}</strong>
              </button>
            ))}
          </div>

          <div className="dashboard-workspace-toolbar">
            <p>
              Showing{" "}
              <strong>
                {activeWorkspaceTab === "customers"
                  ? visibleCustomerSummaries.length
                  : visibleServiceRecords.length}
              </strong>{" "}
              of <strong>{activeWorkspaceTabConfig?.count || 0}</strong>{" "}
              {activeWorkspaceTabConfig?.itemLabel}.
            </p>
            {(activeWorkspaceTab === "customers" && customerSummaries.length > dashboardPreviewLimit) ||
              (activeWorkspaceTab === "jobs" && serviceRecords.length > dashboardPreviewLimit) ? (
              <button
                className="dashboard-workspace-toolbar__button"
                onClick={() => toggleWorkspaceTabExpansion(activeWorkspaceTab)}
                type="button"
              >
                {expandedWorkspaceTabs[activeWorkspaceTab] ? "Show less" : "Show all"}
              </button>
            ) : null}
          </div>

          {activeWorkspaceTab === "customers" ? (
            <div className="dashboard-customer-grid">
              {customerSummaries.length > 0 ? (
                visibleCustomerSummaries.map((customer) => (
                  <article className="dashboard-customer-card" key={customer.key}>
                    <div className="dashboard-customer-card__top">
                      <div>
                        <h3>{customer.name}</h3>
                        <p>{customer.phone || "Phone not available"}</p>
                      </div>
                      <span
                        className={`dashboard-customer-card__badge${customer.isRepeatCustomer
                          ? " dashboard-customer-card__badge--repeat"
                          : ""
                          }`}
                      >
                        {customer.isRepeatCustomer ? "Repeat customer" : "Customer"}
                      </span>
                    </div>

                    <div className="dashboard-customer-card__summary">
                      <div>
                        <span>Vehicles</span>
                        <strong>{customer.vehicleCount}</strong>
                      </div>
                      <div>
                        <span>Previous services</span>
                        <strong>{customer.serviceCount}</strong>
                      </div>
                      <div>
                        <span>Last visit</span>
                        <strong>{formatDisplayDate(customer.lastServiceDate, "No service yet")}</strong>
                      </div>
                      <div>
                        <span>Total spend</span>
                        <strong>{formatCurrencyInr(customer.totalCustomerSpend)}</strong>
                      </div>
                    </div>

                    <div className="dashboard-customer-card__section">
                      <div className="dashboard-job-card__section-title">Customer history</div>
                      <p className="dashboard-customer-card__history-copy">
                        {customer.serviceCount > 0
                          ? `${customer.name} has ${customer.serviceCount} recorded service entries across ${customer.vehicleCount} vehicle${customer.vehicleCount === 1 ? "" : "s"}.`
                          : `${customer.name} is registered, but no service history has been added yet.`}
                      </p>
                    </div>

                    {isCustomerPreviewExpanded ? (
                      <>
                        <div className="dashboard-customer-card__section">
                          <div className="dashboard-job-card__section-title">Previous services</div>
                          {customer.previousServices.length > 0 ? (
                            <div className="dashboard-customer-card__services">
                              {customer.previousServices.map((record) => (
                                <article className="dashboard-customer-card__service" key={record.id}>
                                  <div>
                                    <h4>{record.service_type}</h4>
                                    <p>
                                      {record.registration_number} · {formatDisplayDate(getJobTrackingDate(record))}
                                    </p>
                                  </div>
                                  <span className="dashboard-overview-job__status">
                                    {formatStatusLabel(record.status, "Requested")}
                                  </span>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <p className="dashboard-customer-card__empty">
                              Previous services will appear here once work is recorded.
                            </p>
                          )}
                        </div>

                        <div className="dashboard-customer-card__section">
                          <div className="dashboard-job-card__section-title">Notes</div>
                          <textarea
                            className="dashboard-customer-card__notes-input"
                            onChange={(event) =>
                              handleCustomerNoteChange(customer.key, event.target.value)
                            }
                            placeholder="Add useful customer notes for repeat visits"
                            value={customerNoteDrafts[customer.key] ?? customer.notes ?? ""}
                          />
                          <button
                            className="dashboard-customer-card__notes-button"
                            disabled={Boolean(savingCustomerNotes[customer.key])}
                            onClick={() => handleCustomerNoteSave(customer)}
                            type="button"
                          >
                            {savingCustomerNotes[customer.key]
                              ? "Saving..."
                              : customer.notes?.trim()
                                ? "Update Note"
                                : "Add Note"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="dashboard-customer-card__section">
                        <div className="dashboard-job-card__section-title">Preview mode</div>
                        <p className="dashboard-customer-card__history-copy">
                          {customer.notes?.trim()
                            ? customer.notes
                            : "Open Show all to manage notes and full service history for this customer."}
                        </p>
                      </div>
                    )}
                  </article>
                ))
              ) : (
                <div className="dashboard-empty">
                  <div className="dashboard-empty__badge">No customers yet</div>
                  <h3>Customer cards will appear once vehicles or services are added.</h3>
                  <p>Use customer history and notes here to handle repeat customers more easily.</p>
                  <Link className="dashboard-empty__button" to={getAddVehicleRoute()}>
                    Add First Customer Vehicle
                  </Link>
                </div>
              )}
            </div>
          ) : null}

          {activeWorkspaceTab === "jobs" ? (
            <div className="dashboard-grid">
              {serviceRecords.length > 0 ? (
                visibleServiceRecords.map((record) => {
                  const checklistItems = getJobChecklistItems(record);
                  const primaryDate = getJobTrackingDate(record);
                  const followUpDate = record.booking_date || record.next_service_date;
                  const hasCustomerFeedback = Boolean(
                    record.customer_rating || String(record.customer_feedback || "").trim()
                  );
                  const hasCustomerComplaint = Boolean(String(record.customer_complaint || "").trim());
                  const workNote =
                    record.work_summary ||
                    record.customer_feedback ||
                    record.customer_complaint_mechanic_note ||
                    record.customer_complaint ||
                    record.complaint ||
                    "Waiting for mechanic notes to be added.";
                  // const statusStage = getStatusStage(record.status);

                  return (
                    <article className="dashboard-card dashboard-card--job" key={record.id}>
                      <div className="dashboard-card__top">
                        <div className="dashboard-card__icon">
                          {record.model?.charAt(0)?.toUpperCase() || ""}
                        </div>
                        <span className="dashboard-card__pill">
                          {formatStatusLabel(record.status, "Requested")}
                        </span>
                      </div>

                      <div className="dashboard-card__content">
                        <h3>{record.brand} {record.model}</h3>
                        <p>
                          {record.service_type} for {record.registration_number}.
                          {record.booking_time_slot ? ` Slot: ${record.booking_time_slot}.` : ""}
                          {record.complaint ? ` Complaint: ${record.complaint}` : ""}
                          {/* {record.customer_complaint ? ` Customer complaint: ${record.customer_complaint}` : ""} */}
                        </p>
                        {hasCustomerFeedback || hasCustomerComplaint ? (
                          <div className="dashboard-card__customer-flags">
                            {hasCustomerFeedback ? (
                              <span className="dashboard-card__customer-flag">
                                Rating {record.customer_rating ? `${record.customer_rating}/5` : "received"}
                              </span>
                            ) : null}
                            {hasCustomerComplaint ? (
                              <span className="dashboard-card__customer-flag dashboard-card__customer-flag--complaint">
                                Complaint {formatComplaintStatusLabel(record.customer_complaint_status)}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="dashboard-card__meta">
                        <div>
                          <span>Owner of asset</span>
                          <strong>{record.owner_name}</strong>
                        </div>
                        <div>
                          <span>Mechanic</span>
                          <strong>{record.mechanic_name || "Mechanic entry"}</strong>
                        </div>
                      </div>
{/* 
                      <div className="dashboard-job-card__section">
                        <div className="dashboard-job-card__section-title">
                          Real-time status
                        </div>
                        <div className="dashboard-status-flow dashboard-status-flow--compact dashboard-status-flow--booking">
                          {["Requested", "Accepted", "In Progress", "Completed"].map((label, index) => {
                            const stepClassName =
                              index < statusStage
                                ? " dashboard-status-flow__step--done"
                                : index === statusStage
                                  ? " dashboard-status-flow__step--current"
                                  : "";

                            return (
                              <div
                                className={`dashboard-status-flow__step${stepClassName}`}
                                key={label}
                              >
                                <span>{label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div> */}

                      {isJobPreviewExpanded ? (
                        <>
                          <div className="dashboard-job-card__section">
                            <div className="dashboard-job-card__section-title">
                              Tasks checklist
                            </div>
                            <div className="dashboard-job-card__checklist">
                              {checklistItems.map((item) => (
                                <div
                                  className={`dashboard-job-card__checklist-item${item.done ? " dashboard-job-card__checklist-item--done" : ""
                                    }`}
                                  key={item.label}
                                >
                                  <span className="dashboard-job-card__checkmark">
                                    {item.done ? "Done" : "Open"}
                                  </span>
                                  <strong>{item.label}</strong>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="dashboard-job-card__section">
                            <div className="dashboard-job-card__section-title">
                              Time &amp; work tracking
                            </div>
                            <div className="dashboard-job-card__tracking">
                              <div className="dashboard-job-card__tracking-item">
                                <span>Opened on</span>
                                <strong>{formatDisplayDate(primaryDate)}</strong>
                              </div>
                              <div className="dashboard-job-card__tracking-item">
                                <span>Scheduled for</span>
                                <strong>{formatDisplayDate(followUpDate)}</strong>
                              </div>
                              <div className="dashboard-job-card__tracking-item">
                                <span>Bill amount</span>
                                <strong>{formatCurrencyInr(record.amount)}</strong>
                              </div>
                              <div className="dashboard-job-card__tracking-item">
                                <span>Time slot</span>
                                <strong>{formatDisplayTime(record.booking_time_slot)}</strong>
                              </div>
                              <div className="dashboard-job-card__tracking-item">
                                <span>Workload</span>
                                <strong>{Number(record.estimated_hours || 1).toFixed(1)} hrs</strong>
                              </div>
                              <div className="dashboard-job-card__tracking-item">
                                <span>Current status</span>
                                <strong>{formatStatusLabel(record.status, "Requested")}</strong>
                              </div>
                            </div>
                            <div className="dashboard-job-card__note">
                              <span>Work note</span>
                              <p>{workNote}</p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="dashboard-job-card__section">
                          <div className="dashboard-job-card__section-title">
                            Quick tracking
                          </div>
                          <div className="dashboard-job-card__tracking dashboard-job-card__tracking--compact">
                            <div className="dashboard-job-card__tracking-item">
                              <span>Opened on</span>
                              <strong>{formatDisplayDate(primaryDate)}</strong>
                            </div>
                            <div className="dashboard-job-card__tracking-item">
                              <span>Scheduled for</span>
                              <strong>{formatDisplayDate(followUpDate)}</strong>
                            </div>
                            <div className="dashboard-job-card__tracking-item">
                              <span>Bill amount</span>
                              <strong>{formatCurrencyInr(record.amount)}</strong>
                            </div>
                            <div className="dashboard-job-card__tracking-item">
                              <span>Workload</span>
                              <strong>{Number(record.estimated_hours || 1).toFixed(1)} hrs</strong>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="dashboard-card__footer">
                        <div>
                          <span>Service type</span>
                          <strong>{record.service_type || "General service"}</strong>
                        </div>
                        <div>
                          <span>Status updated</span>
                          <strong>{formatStatusLabel(record.status, "Requested")}</strong>
                        </div>
                      </div>
                      {formatStatusLabel(record.status) !== "Completed" ? (
                        <div className="dashboard-card__actions">
                          <Link className="dashboard-card__edit" to={getAddServiceRoute(record.id)}>
                            Edit Service
                          </Link>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <div className="dashboard-empty">
                  <div className="dashboard-empty__badge">No records yet</div>
                  <h3>Start by adding a vehicle and then creating its first service record.</h3>
                  <p>Service records will appear here with real-time status, schedule details, and workload tracking.</p>
                  <Link className="dashboard-empty__button" to={getAddServiceRoute()}>
                    Add First Service
                  </Link>
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}
