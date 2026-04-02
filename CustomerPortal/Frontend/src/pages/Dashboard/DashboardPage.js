import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, EXPENSE_API, NOTIFICATION_API, SERVICE_RECORD_API, USER_API, VEHICLE_API, } from "../../services/api";
import { clearSession, getAddServiceRoute, getAddVehicleRoute, getComplaintRoute, getFeedbackRoute, getLoginRoute, isAuthError, getStoredToken, } from "../../utils/session";
import { formatComplaintStatusLabel, formatExpenseServiceTypeLabel, formatCurrencyInr, formatDisplayDate, formatStatusLabel, formatTransportOptionLabel, formatVehicleTypeLabel, getDateValue, } from "../../utils/formatters";
import "./Dashboard.css";

export default function CustomerDashboardPage() {
  const [vehicles, setVehicles] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [expenseAnalytics, setExpenseAnalytics] = useState({
    summary: {},
    vehicle_totals: [],
    monthly_report: [],
    yearly_report: [],
    service_wise_breakdown: [],
  });
  const [serviceRecords, setServiceRecords] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [downloadingInvoiceRecordId, setDownloadingInvoiceRecordId] = useState(null);
  const [user, setUser] = useState(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isShowingAllVehicles, setIsShowingAllVehicles] = useState(false);
  const [isShowingAllServiceRecords, setIsShowingAllServiceRecords] = useState(false);
  const actionMenuRef = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();

  const expenseSummary = expenseAnalytics.summary || {};
  const vehicleExpenseTotals = Array.isArray(expenseAnalytics.vehicle_totals)
    ? expenseAnalytics.vehicle_totals
    : [];
  const monthlyExpenseReport = Array.isArray(expenseAnalytics.monthly_report)
    ? expenseAnalytics.monthly_report
    : [];
  const yearlyExpenseReport = Array.isArray(expenseAnalytics.yearly_report)
    ? expenseAnalytics.yearly_report
    : [];
  const serviceWiseBreakdown = Array.isArray(expenseAnalytics.service_wise_breakdown)
    ? expenseAnalytics.service_wise_breakdown
    : [];
  const vehicleExpenseTotalsById = new Map(
    vehicleExpenseTotals.map((item) => [String(item.vehicle_id), Number(item.total_expense || 0)])
  );
  const fallbackTotalExpense = expenses.reduce(
    (sum, exp) => sum + Number(exp.amount || 0),
    0
  );
  const totalExpense = Number(expenseSummary.total_expense ?? fallbackTotalExpense);
  const expenseEntries = Number(expenseSummary.expense_entries ?? expenses.length);
  const activeBookings = serviceRecords
    .filter(
      (record) =>
        record.customer_booking &&
        (record.status === "pending" || record.status === "in_progress")
    )
    .sort((firstRecord, secondRecord) => {
      const firstDate = getDateValue(firstRecord.booking_date) || new Date(8640000000000000);
      const secondDate = getDateValue(secondRecord.booking_date) || new Date(8640000000000000);
      return firstDate - secondDate;
    });
  const upcomingBooking = activeBookings[0] || null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueSoonThreshold = new Date(today);
  dueSoonThreshold.setDate(dueSoonThreshold.getDate() + 7);

  const vehicleSummaries = vehicles.map((vehicle) => {
    const relatedRecords = serviceRecords.filter(
      (record) => String(record.vehicle_id) === String(vehicle.id)
    );
    const vehicleExpenses = expenses.filter(
      (exp) => String(exp.vehicle_id) === String(vehicle.id)
    );

    const totalVehicleExpense = vehicleExpenseTotalsById.has(String(vehicle.id))
      ? vehicleExpenseTotalsById.get(String(vehicle.id))
      : vehicleExpenses.reduce(
        (sum, exp) => sum + Number(exp.amount || 0),
        0
      );
    const activeBooking =
      relatedRecords
        .filter(
          (record) =>
            record.customer_booking &&
            (record.status === "pending" || record.status === "in_progress")
        )
        .sort((firstRecord, secondRecord) => {
          const firstDate = getDateValue(firstRecord.booking_date) || new Date(8640000000000000);
          const secondDate = getDateValue(secondRecord.booking_date) || new Date(8640000000000000);
          return firstDate - secondDate;
        })[0] || null;
    const latestServiceRecord =
      relatedRecords
        .filter(
          (record) =>
            !record.customer_booking ||
            Boolean(record.service_date) ||
            record.status === "completed" ||
            record.status === "delivered"
        )
        .sort((firstRecord, secondRecord) => {
          const firstDate = getDateValue(firstRecord.service_date) || new Date(0);
          const secondDate = getDateValue(secondRecord.service_date) || new Date(0);
          return secondDate - firstDate;
        })[0] || null;
    const nextServiceDateValue = getDateValue(latestServiceRecord?.next_service_date);
    const latestStatus = activeBooking?.status || latestServiceRecord?.status || "not_started";

    let healthTone = "attention";
    let healthLabel = "Needs first service";
    let healthDescription = "No service history yet";
    let healthPriority = 4;

    if (activeBooking) {
      healthTone = "active";
      healthLabel = activeBooking.status === "in_progress" ? "In service" : "Booked";
      healthDescription = activeBooking.booking_date
        ? `Visit scheduled for ${formatDisplayDate(activeBooking.booking_date)}`
        : "Workshop update is still in progress";
      healthPriority = 3;
    } else if (nextServiceDateValue && nextServiceDateValue < today) {
      healthTone = "overdue";
      healthLabel = "Overdue";
      healthDescription = "Next scheduled service date has passed";
      healthPriority = 1;
    } else if (nextServiceDateValue && nextServiceDateValue <= dueSoonThreshold) {
      healthTone = "due-soon";
      healthLabel = "Due soon";
      healthDescription = "Service is due within the next 7 days";
      healthPriority = 2;
    } else if (latestServiceRecord) {
      healthTone = "healthy";
      healthLabel = "Healthy";
      healthDescription = nextServiceDateValue
        ? "No immediate service due right now"
        : "Latest service update looks clear";
      healthPriority = 5;
    }

    return {
      ...vehicle,
      serviceCount: relatedRecords.length,
      lastServiceDate: latestServiceRecord?.service_date || null,
      nextServiceDate: latestServiceRecord?.next_service_date || null,
      latestStatus,
      latestServiceType: activeBooking?.service_type || latestServiceRecord?.service_type || "No service yet",
      latestComplaint: activeBooking?.complaint || latestServiceRecord?.complaint || null,
      latestAmount: latestServiceRecord?.amount || 0,
      upcomingBookingDate: activeBooking?.booking_date || null,
      upcomingBookingSlot: activeBooking?.booking_time_slot || null,
      transportOption: activeBooking?.transport_option || null,
      healthTone,
      healthLabel,
      healthDescription,
      healthPriority,
      totalExpense: totalVehicleExpense,
    };
  }).sort((firstVehicle, secondVehicle) => {
    if (firstVehicle.healthPriority !== secondVehicle.healthPriority) {
      return firstVehicle.healthPriority - secondVehicle.healthPriority;
    }

    return new Date(secondVehicle.created_at) - new Date(firstVehicle.created_at);
  });

  // const dueSoonVehicles = vehicleSummaries.filter((vehicle) => vehicle.healthTone === "due-soon").length;
  const overdueVehicles = vehicleSummaries.filter((vehicle) => vehicle.healthTone === "overdue").length;
  // const activeServiceVehicles = vehicleSummaries.filter((vehicle) => vehicle.healthTone === "active").length;
  // const vehiclesWithoutHistory = vehicleSummaries.filter((vehicle) => vehicle.serviceCount === 0).length;
  const nextBookingVehicleLabel = upcomingBooking?.registration_number || "No booking";
  const nextBookingDateLabel = upcomingBooking?.booking_date
    ? formatDisplayDate(upcomingBooking.booking_date)
    : "Not scheduled";
  const activeExpenseVehicles = Number(
    expenseSummary.active_vehicles ??
    vehicleSummaries.filter((vehicle) => Number(vehicle.totalExpense || 0) > 0).length
  );
  const latestMonthlyExpenseEntry = monthlyExpenseReport[0] || null;
  const latestYearlyExpenseEntry = yearlyExpenseReport[0] || null;
  const averageExpensePerVehicle = activeExpenseVehicles > 0
    ? totalExpense / activeExpenseVehicles
    : 0;
  const recentMonthlyExpenseReport = monthlyExpenseReport.slice(0, 6);
  const recentYearlyExpenseReport = yearlyExpenseReport.slice(0, 4);
  const topServiceWiseBreakdown = serviceWiseBreakdown.slice(0, 6);
  const topVehicleExpenseTotals = vehicleExpenseTotals.slice(0, 5);
  const vehiclePreviewCount = 2;
  const serviceRecordPreviewCount = 2;
  const visibleVehicleSummaries = isShowingAllVehicles
    ? vehicleSummaries
    : vehicleSummaries.slice(0, vehiclePreviewCount);
  const visibleServiceRecords = isShowingAllServiceRecords
    ? serviceRecords
    : serviceRecords.slice(0, serviceRecordPreviewCount);
  const unreadNotifications = notifications.filter((notification) => !notification.is_read);
  const operationalSignals = [
    {
      label: "Workflow status",
      value: activeBookings.length > 0
        ? `${activeBookings.length} booking${activeBookings.length === 1 ? "" : "s"} active`
        : "No active bookings",
    },
    {
      label: "Alert center",
      value: unreadNotifications.length > 0
        ? `${unreadNotifications.length} unread notification${unreadNotifications.length === 1 ? "" : "s"}`
        : "All alerts reviewed",
    },
    {
      label: "Monthly spend",
      value: latestMonthlyExpenseEntry
        ? `${latestMonthlyExpenseEntry.label}: ${formatCurrencyInr(latestMonthlyExpenseEntry.total || 0)}`
        : "No monthly spend recorded",
    },
  ];
  const expenseSummaryCards = [
    { label: "All-time expense", value: formatCurrencyInr(totalExpense) },
    {
      label: latestMonthlyExpenseEntry?.label || "Latest month expense",
      value: formatCurrencyInr(latestMonthlyExpenseEntry?.total || 0),
    },
    {
      label: latestYearlyExpenseEntry?.year
        ? `${latestYearlyExpenseEntry.year} expense`
        : "Latest yearly expense",
      value: formatCurrencyInr(latestYearlyExpenseEntry?.total || 0),
    },
    { label: "Expense entries", value: String(expenseEntries) },
    { label: "Vehicles with spend", value: String(activeExpenseVehicles) },
    { label: "Average per active vehicle", value: formatCurrencyInr(averageExpensePerVehicle) },
  ];
  // const latestServicedVehicle =
  //   vehicleSummaries
  //     .filter((vehicle) => vehicle.lastServiceDate)
  //     .sort(
  //       (firstVehicle, secondVehicle) =>
  //         getDateValue(secondVehicle.lastServiceDate) - getDateValue(firstVehicle.lastServiceDate)
  //     )[0] || null;

  const handleDashboardError = useCallback((error) => {
    if (isAuthError(error)) {
      toast.error(error.response?.data?.error || "Please login again.");
      clearSession();
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    const message = error.response?.data?.error || "Something went wrong.";
    toast.error(message);
  }, [navigate, toast]);

  const loadNotifications = useCallback(() => {
    if (!getStoredToken()) {
      setNotifications([]);
      return Promise.resolve([]);
    }

    return makeApiCall(
      API_CALL_TYPE.GET_CALL,
      NOTIFICATION_API.list,
      (response) => setNotifications(Array.isArray(response) ? response : []),
      () => undefined,
      "",
      null,
      { limit: 20 },
      { skipGlobalLoader: true }
    ).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    makeApiCall(API_CALL_TYPE.GET_CALL, VEHICLE_API.list, (response) => setVehicles(response || []), handleDashboardError, "", null, {}).catch(() => undefined);
    makeApiCall(API_CALL_TYPE.GET_CALL, SERVICE_RECORD_API.list, (response) => setServiceRecords(response || []), handleDashboardError, "", null, {}).catch(() => undefined);
    makeApiCall(API_CALL_TYPE.GET_CALL, USER_API.profile, (response) => setUser(response || null), handleDashboardError, "", null, {}).catch(() => undefined);
    makeApiCall(API_CALL_TYPE.GET_CALL, EXPENSE_API.list, (response) => setExpenses(response || []), handleDashboardError, "", null, {}).catch(() => undefined);
    makeApiCall(API_CALL_TYPE.GET_CALL, EXPENSE_API.analytics, (response) => { setExpenseAnalytics(response || { summary: {}, vehicle_totals: [], monthly_report: [], yearly_report: [], service_wise_breakdown: [], }); }, handleDashboardError, "", null, {}).catch(() => undefined);
    void loadNotifications();

    const notificationsIntervalId = window.setInterval(() => {
      void loadNotifications();
    }, 15000);

    return () => {
      window.clearInterval(notificationsIntervalId);
    };
  }, [handleDashboardError, loadNotifications, navigate]);

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

  const logoutUser = () => {
    makeApiCall(API_CALL_TYPE.POST_CALL, USER_API.logout, () => { clearSession(); navigate(getLoginRoute(), { replace: true }); },
      (error) => {
        toast.error(error.response?.data?.error || "Logout failed.");
        clearSession();
        navigate(getLoginRoute(), { replace: true });
      },
      "",
      null,
      {}
    ).catch(() => undefined);
  };

  function getRatingSummary(rating, feedback) {
    if (!rating && !feedback) {
      return "Not submitted";
    }

    if (!rating) {
      return "Feedback shared";
    }

    return `${rating}/5 rating shared`;
  }

  function getInvoiceNumber(recordId) {
    return `INV-${String(recordId).padStart(6, "0")}`;
  }

  function getWarrantyStatus(startDate, endDate) {
    if (!startDate && !endDate) {
      return "Not added";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = getDateValue(startDate);
    const end = getDateValue(endDate);

    if (start && start > today) {
      return "Upcoming";
    }

    if (end && end < today) {
      return "Expired";
    }

    return "Active";
  }

  function getTimelineHeading(record, showBookingDetails) {
    if (showBookingDetails) {
      if (record.status === "in_progress") {
        return "Service visit in progress";
      }

      return "Service booking scheduled";
    }

    if (record.status === "delivered") {
      return "Vehicle delivered";
    }

    if (record.status === "completed") {
      return "Service completed";
    }

    return "Workshop update logged";
  }

  function getTimelineSummary(record, showBookingDetails) {
    if (showBookingDetails) {
      if (record.complaint) {
        return record.complaint;
      }

      return "Booking request captured. Workshop team will review the slot and vehicle concern.";
    }

    if (record.work_summary) {
      return record.work_summary;
    }

    if (record.complaint) {
      return `Concern handled: ${record.complaint}`;
    }

    return "Work summary will appear here once the workshop closes the job card.";
  }

  function getComplaintInsight(record, canRaiseComplaint) {
    if (!record.customer_complaint) {
      return canRaiseComplaint
        ? "Report service issues, billing concerns, or behavior problems."
        : "Complaint can be raised once the service is underway.";
    }

    const complaintParts = [`Complaint: ${record.customer_complaint}`];

    if (record.customer_complaint_mechanic_note) {
      complaintParts.push(`Workshop note: ${record.customer_complaint_mechanic_note}`);
    } else if (record.customer_complaint_updated_at || record.customer_complaint_status === "resolved") {
      complaintParts.push(
        `Latest workshop action: ${formatComplaintStatusLabel(
          record.customer_complaint_status,
          "Open"
        )}${record.customer_complaint_updated_at ? ` on ${formatDisplayDate(record.customer_complaint_updated_at)}` : ""}.`
      );
    } else {
      complaintParts.push("Waiting for the workshop to review this complaint.");
    }

    return complaintParts.join(" ");
  }

  const handleInvoiceDownload = (record) => {
    setDownloadingInvoiceRecordId(record.id);

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      SERVICE_RECORD_API.invoice(record.id),
      (response) => {
        const blobUrl = window.URL.createObjectURL(new Blob([response], { type: "application/pdf" }));
        const link = document.createElement("a");

        link.href = blobUrl;
        link.download = `${getInvoiceNumber(record.id)}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
        setDownloadingInvoiceRecordId(null);
        toast.success("Invoice download started.");
      },
      (error) => {
        toast.error(error.response?.data?.error || "Failed to download invoice.");
        setDownloadingInvoiceRecordId(null);
      },
      "",
      null,
      {},
      { responseType: "blob" }
    ).catch(() => undefined);
  };

  return (
    <section className="dashboard-page">
      <div className="dashboard-page__backdrop"></div>

      <div className="dashboard-container">
        <header className="dashboard-hero">
          <div className="dashboard-hero__content">
            <p className="dashboard-hero__eyebrow">Operational snapshot</p>
            <h1>Customer operations dashboard</h1>
            <div className="dashboard-hero__signalbar">
              {operationalSignals.map((item) => (
                <article className="dashboard-hero__signal" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>

            {/* <div className="dashboard-hero__actions">
              <div className="dashboard-hero__menu" ref={actionMenuRef}>
                <button
                  className="dashboard-hero__secondary dashboard-hero__menu-trigger"
                  type="button"
                  aria-expanded={isActionMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setIsActionMenuOpen((isOpen) => !isOpen)}
                >
                  <span className="dashboard-hero__menu-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M4 7h16"></path>
                      <path d="M4 12h16"></path>
                      <path d="M4 17h16"></path>
                    </svg>
                  </span>
                  Menu
                </button>

                {isActionMenuOpen ? (
                  <div className="dashboard-hero__menu-panel" role="menu">
                    {secondaryHeroActions.map((action) => (
                      action.route.startsWith("#") ? (
                        <a
                          key={action.label}
                          className="dashboard-hero__menu-item"
                          role="menuitem"
                          href={action.route}
                          onClick={() => setIsActionMenuOpen(false)}
                        >
                          {action.label}
                        </a>
                      ) : (
                        <Link
                          key={action.label}
                          className="dashboard-hero__menu-item"
                          role="menuitem"
                          to={action.route}
                          onClick={() => setIsActionMenuOpen(false)}
                        >
                          {action.label}
                        </Link>
                      )
                    ))}
                    <button
                      className="dashboard-hero__menu-item dashboard-hero__menu-item--danger"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsActionMenuOpen(false);
                        setIsLogoutConfirmOpen(true);
                      }}
                    >
                      Logout
                    </button>
                  </div>
                ) : null}
              </div>
              <Link className="dashboard-hero__notification-link" to={getNotificationsRoute()}>
                <span className="dashboard-hero__notification-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M12 3.5a4 4 0 0 0-4 4v1.3c0 1.5-.4 2.9-1.2 4.2L5.7 14.8a1 1 0 0 0 .8 1.7h11a1 1 0 0 0 .8-1.7L17.2 13c-.8-1.3-1.2-2.7-1.2-4.2V7.5a4 4 0 0 0-4-4Z"></path>
                    <path d="M9.5 18.2a2.7 2.7 0 0 0 5 0"></path>
                  </svg>
                </span>
                <span className="dashboard-hero__notification-text">Notifications</span>
                {unreadNotifications.length > 0 ? (
                  <span className="dashboard-hero__notification-badge">
                    {unreadNotifications.length > 99 ? "99+" : unreadNotifications.length}
                  </span>
                ) : null}
              </Link>
              <div className="dashboard-hero__buttons">
                <Link className="dashboard-hero__button" to={getAddVehicleRoute()}>
                  Add vehicle
                </Link>
                <Link className="dashboard-hero__button" to={getAddServiceRoute()}>
                  Book service
                </Link>
                <Link
                  className="dashboard-hero__button dashboard-hero__button--danger"
                  to={getEmergencyRoute()}
                >
                  Emergency SOS
                </Link>
              </div>
            </div> */}
          </div>

          <div className="dashboard-hero__panel">
            <div className="dashboard-hero__panel-label">Account snapshot</div>
            <div className="dashboard-hero__stats">
              <article className="dashboard-stat">
                <span>Total maintenance spend</span>
                <strong>{formatCurrencyInr(totalExpense)}</strong>
              </article>
              <article className="dashboard-stat">
                <span>Next active booking</span>
                <strong>{nextBookingVehicleLabel}</strong>
              </article>
              <article className="dashboard-stat">
                <span>Scheduled visit date</span>
                <strong>{nextBookingDateLabel}</strong>
              </article>
              <article className="dashboard-stat">
                <span>Overdue vehicles</span>
                <strong>{overdueVehicles}</strong>
              </article>
            </div>
            <div className="dashboard-hero__foot">
              <span>Signed in as</span>
              <strong>{user?.name || "User"}</strong>
              <small>
                {upcomingBooking
                  ? `Next workshop touchpoint: ${nextBookingDateLabel}`
                  : "No workshop visit is currently scheduled."}
              </small>
            </div>
          </div>
        </header>

        {isLogoutConfirmOpen ? (
          <div
            className="dashboard-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-logout-title"
          >
            <div
              className="dashboard-modal__backdrop"
              onClick={() => setIsLogoutConfirmOpen(false)}
            ></div>
            <div className="dashboard-modal__panel">
              <div className="dashboard-modal__badge">Logout Confirmation</div>
              <h2 id="dashboard-logout-title">Do you want to log out?</h2>
              <p>
                Your current session will be closed. You will need to log in again to access the
                dashboard.
              </p>
              <div className="dashboard-modal__actions">
                <button
                  className="dashboard-modal__button dashboard-modal__button--secondary"
                  type="button"
                  onClick={() => setIsLogoutConfirmOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="dashboard-modal__button dashboard-modal__button--danger"
                  type="button"
                  onClick={() => {
                    setIsLogoutConfirmOpen(false);
                    logoutUser();
                  }}
                >
                  Yes, Logout
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* 
        <section className="dashboard-section dashboard-section--summary">
          <div className="dashboard-section__header">
            <div>
              <p className="dashboard-section__eyebrow">Vehicle Health</p>
              <h2>Overall vehicle health summary</h2>
              <span>See overdue services, due-soon reminders, and vehicles waiting for their first service record.</span>
            </div>
          </div>

          <div className="dashboard-health-grid">
            {[
              { label: "Due soon", value: dueSoonVehicles, tone: "due-soon" },
              { label: "Overdue", value: overdueVehicles, tone: "overdue" },
              { label: "In service", value: activeServiceVehicles, tone: "active" },
              { label: "No history", value: vehiclesWithoutHistory, tone: "attention" },
            ].map((item) => (
              <article
                className={`dashboard-health-card dashboard-health-card--${item.tone}`}
                key={item.label}
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>

          <div className="dashboard-customer-overview">
            <article className="dashboard-overview-card">
              <p className="dashboard-card__tag">Latest Service</p>
              <h3>
                {latestServicedVehicle
                  ? `${latestServicedVehicle.brand} ${latestServicedVehicle.model}`
                  : "No recent service yet"}
              </h3>
              <p>
                {latestServicedVehicle
                  ? `${latestServicedVehicle.registration_number} was last serviced on ${formatDisplayDate(
                    latestServicedVehicle.lastServiceDate
                  )}.`
                  : "Once a service record is added, the latest service update will appear here."}
              </p>
            </article>

            <article className="dashboard-overview-card">
              <p className="dashboard-card__tag">Upcoming Booking</p>
              <h3>
                {upcomingBooking
                  ? `${upcomingBooking.brand} ${upcomingBooking.model}`
                  : "No booking scheduled"}
              </h3>
              <p>
                {upcomingBooking
                  ? `${upcomingBooking.registration_number} is booked for ${formatDisplayDate(
                    upcomingBooking.booking_date,
                    "Date not set"
                  )} during ${upcomingBooking.booking_time_slot || "the selected slot"}.`
                  : "Your next confirmed service booking will appear here once you reserve a slot."}
              </p>
            </article>
          </div>
        </section> */}

        <section className="dashboard-section dashboard-section--expenses">
          <div className="dashboard-section__header">
            <div>
              <p className="dashboard-section__eyebrow">Cost Intelligence</p>
              <h2>Maintenance spend and ownership cost visibility</h2>
              <span>Review total spend per vehicle, monthly and yearly movement, and service-type cost concentration in one place.</span>
            </div>
          </div>

          <div className="dashboard-expense-grid">
            {expenseSummaryCards.map((item) => (
              <article className="dashboard-expense-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>

          <div className="dashboard-report-grid">
            <article className="dashboard-report-card">
              <p className="dashboard-card__tag">Monthly Report</p>
              <h3>Recent monthly spend</h3>
              {recentMonthlyExpenseReport.length > 0 ? (
                <div className="dashboard-report-list">
                  {recentMonthlyExpenseReport.map((item) => (
                    <div className="dashboard-report-row" key={`${item.year}-${item.month}`}>
                      <div>
                        <span>{item.label}</span>
                        <strong>{item.year}</strong>
                      </div>
                      <strong>{formatCurrencyInr(item.total)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dashboard-report-empty">Monthly expense data will appear here after expenses are added.</p>
              )}
            </article>

            <article className="dashboard-report-card">
              <p className="dashboard-card__tag">Yearly Report</p>
              <h3>Annual spend summary</h3>
              {recentYearlyExpenseReport.length > 0 ? (
                <div className="dashboard-report-list">
                  {recentYearlyExpenseReport.map((item) => (
                    <div className="dashboard-report-row" key={item.year}>
                      <div>
                        <span>Financial year snapshot</span>
                        <strong>{item.year}</strong>
                      </div>
                      <strong>{formatCurrencyInr(item.total)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dashboard-report-empty">Yearly expense data will appear here after expenses are added.</p>
              )}
            </article>

            <article className="dashboard-report-card">
              <p className="dashboard-card__tag">Service-Wise Breakdown</p>
              <h3>Where your spend is going</h3>
              {topServiceWiseBreakdown.length > 0 ? (
                <div className="dashboard-report-list">
                  {topServiceWiseBreakdown.map((item) => (
                    <div className="dashboard-report-row" key={item.service_type}>
                      <div>
                        <span>{item.expense_entries} entries</span>
                        <strong>{formatExpenseServiceTypeLabel(item.service_type)}</strong>
                      </div>
                      <strong>{formatCurrencyInr(item.total)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dashboard-report-empty">Service-wise cost breakdown will appear here after expenses are added.</p>
              )}
            </article>
          </div>

          <article className="dashboard-report-card dashboard-report-card--wide">
            <p className="dashboard-card__tag">Total Spend Per Vehicle</p>
            <h3>Vehicles ranked by expense</h3>
            {topVehicleExpenseTotals.length > 0 ? (
              <div className="dashboard-report-list">
                {topVehicleExpenseTotals.map((vehicle) => (
                  <div className="dashboard-report-row" key={vehicle.vehicle_id}>
                    <div>
                      <span>{vehicle.registration_number || "Registration not set"}</span>
                      <strong>{vehicle.brand} {vehicle.model}</strong>
                    </div>
                    <div className="dashboard-report-row__summary">
                      <span>{vehicle.expense_entries} expenses</span>
                      <strong>{formatCurrencyInr(vehicle.total_expense)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dashboard-report-empty">Per-vehicle totals will appear here once expense records are available.</p>
            )}
          </article>
        </section>

        <section className="dashboard-section dashboard-section--vehicles">
          <div className="dashboard-section__header">
            <div>
              <p className="dashboard-section__eyebrow">Vehicle Registry</p>
              <h2>Registered vehicles</h2>
              <span>See health, latest work, and spend for each vehicle from one view.</span>
            </div>
            {vehicleSummaries.length > vehiclePreviewCount ? (
              <button
                className="dashboard-section__link dashboard-section__link--button"
                type="button"
                onClick={() => setIsShowingAllVehicles((current) => !current)}
              >
                {isShowingAllVehicles ? "Show less" : "Show all"}
              </button>
            ) : null}
          </div>

          <div className="dashboard-grid">
            {vehicleSummaries.length > 0 ? (
              visibleVehicleSummaries.map((vehicle) => (
                <article className="dashboard-card dashboard-card--vehicle" key={vehicle.id}>
                  <div className="dashboard-card__top">
                    <div className="dashboard-card__icon">
                      {vehicle.model?.charAt(0)?.toUpperCase() || ""}
                    </div>
                    <span className={`dashboard-card__pill dashboard-card__pill--${vehicle.healthTone}`}>
                      {vehicle.healthLabel}
                    </span>
                  </div>

                  <div className="dashboard-card__top dashboard-card__top--compact">
                    <span className="dashboard-card__pill">
                      {formatVehicleTypeLabel(vehicle.vehicle_type)}
                    </span>
                    <span className="dashboard-card__subpill">
                      {vehicle.manufacture_year || "Year not set"}
                    </span>
                  </div>

                  <div className="dashboard-card__content">
                    <h3>{vehicle.brand} {vehicle.model}</h3>
                    <p>{vehicle.registration_number}</p>
                    <p>{vehicle.healthDescription}</p>
                  </div>

                  <div className="dashboard-vehicle-card__stats">
                    <div className="dashboard-vehicle-card__stat">
                      <span>Last service</span>
                      <strong>{formatDisplayDate(vehicle.lastServiceDate)}</strong>
                    </div>
                    <div className="dashboard-vehicle-card__stat">
                      <span>Next due service</span>
                      <strong>{formatDisplayDate(vehicle.nextServiceDate)}</strong>
                    </div>
                  </div>

                  <div className="dashboard-card__meta">
                    <div>
                      <span>Current status</span>
                      <strong>{formatStatusLabel(vehicle.latestStatus)}</strong>
                    </div>
                    <div>
                      <span>{vehicle.upcomingBookingDate ? "Upcoming booking" : "Last service type"}</span>
                      <strong>
                        {vehicle.upcomingBookingDate
                          ? `${formatDisplayDate(vehicle.upcomingBookingDate)}${vehicle.upcomingBookingSlot ? ` • ${vehicle.upcomingBookingSlot}` : ""}`
                          : vehicle.latestServiceType}
                      </strong>
                    </div>
                  </div>

                  <div className="dashboard-card__footer">
                    <div>
                      <span>{vehicle.transportOption ? "Transport mode" : "Last bill amount"}</span>
                      <strong>
                        {vehicle.transportOption
                          ? formatTransportOptionLabel(vehicle.transportOption)
                          : formatCurrencyInr(vehicle.latestAmount)}
                      </strong>
                    </div>
                    <div>
                      <span>Total expense</span>
                      <strong>{formatCurrencyInr(vehicle.totalExpense)}</strong>
                    </div>
                    <div>
                      <span>Latest complaint</span>
                      <strong>{vehicle.latestComplaint || "No complaint noted"}</strong>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="dashboard-empty">
                <div className="dashboard-empty__badge">No vehicles registered</div>
                <h3>Add your first vehicle to start tracking service history.</h3>
                <p>Once a vehicle is registered, you will see it here with its full service summary.</p>
                <Link className="dashboard-empty__button" to={getAddVehicleRoute()}>
                  Register first vehicle
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="dashboard-section" id="dashboard-bookings-history">
          <div className="dashboard-section__header">
            <div>
              <p className="dashboard-section__eyebrow">Service Timeline</p>
              <h2>Service timeline</h2>
              <span>Track bookings, completed jobs, support actions, and invoices in one timeline.</span>
            </div>
            <div className="dashboard-section__actions">
              {serviceRecords.length > serviceRecordPreviewCount ? (
                <button
                  className="dashboard-section__link dashboard-section__link--button"
                  type="button"
                  onClick={() => setIsShowingAllServiceRecords((current) => !current)}
                >
                  {isShowingAllServiceRecords ? "Show less" : "Show all"}
                </button>
              ) : null}
              <Link className="dashboard-section__link" to={getAddServiceRoute()}>
                Book service
              </Link>
            </div>
          </div>

          <div className="dashboard-history-timeline">
            {serviceRecords.length > 0 ? (
              visibleServiceRecords.map((record) => {
                const isPendingCustomerBooking =
                  record.customer_booking &&
                  (record.status === "pending" || record.status === "in_progress");
                const showBookingDetails = isPendingCustomerBooking;
                const timelineDate = showBookingDetails
                  ? record.booking_date
                  : record.service_date || record.created_at;
                const timelineHeading = getTimelineHeading(record, showBookingDetails);
                const timelineSummary = getTimelineSummary(record, showBookingDetails);
                const canRateMechanic =
                  ["completed", "delivered"].includes(record.status) &&
                  Boolean(record.mechanic_id) &&
                  !Boolean(record.customer_rating || record.customer_feedback);
                const canOpenChat = Boolean(record.mechanic_id);
                const canRaiseComplaint =
                  record.status !== "pending" &&
                  !Boolean(record.customer_complaint);
                const canDownloadInvoice = ["completed", "delivered"].includes(record.status);
                const hasFeedback = Boolean(record.customer_rating || record.customer_feedback);
                const hasRaisedComplaint = Boolean(record.customer_complaint);
                const hasWarrantyRecord = Boolean(
                  record.warranty_name ||
                  record.warranty_start_date ||
                  record.warranty_end_date ||
                  record.warranty_notes
                );
                const warrantyStatus = getWarrantyStatus(
                  record.warranty_start_date,
                  record.warranty_end_date
                );
                const shouldShowEngagementSection =
                  !showBookingDetails ||
                  canOpenChat ||
                  canRateMechanic ||
                  canRaiseComplaint ||
                  hasFeedback ||
                  hasRaisedComplaint ||
                  canDownloadInvoice ||
                  hasWarrantyRecord;
                const feedbackSummary = getRatingSummary(
                  record.customer_rating,
                  record.customer_feedback
                );

                return (
                  <div className="dashboard-history-item" key={record.id}>
                    <div className="dashboard-history-item__rail">
                      <span className="dashboard-history-item__pin"></span>
                    </div>

                    <article className="dashboard-card dashboard-card--timeline">
                      <div className="dashboard-card__timeline-header">
                        <div>
                          <p className="dashboard-card__timeline-date">
                            {formatDisplayDate(timelineDate, "Date not set")}
                          </p>
                          <h3 className="dashboard-card__timeline-heading">{timelineHeading}</h3>
                        </div>
                        <span className="dashboard-card__pill">
                          {formatStatusLabel(record.status, "Pending")}
                        </span>
                      </div>

                      <div className="dashboard-card__top">
                        <div className="dashboard-card__icon">
                          {record.model?.charAt(0)?.toUpperCase() || ""}
                        </div>
                        <div className="dashboard-card__timeline-vehicle">
                          <strong>{record.brand} {record.model}</strong>
                          <span>{record.registration_number}</span>
                        </div>
                      </div>

                      <div className="dashboard-card__content">
                        <p>
                          {record.service_type} for {record.registration_number}.
                          {showBookingDetails
                            ? ` ${formatTransportOptionLabel(record.transport_option)} booking.`
                            : ""}
                        </p>
                        <p className="dashboard-card__history-note">
                          <strong>{showBookingDetails ? "Booking note:" : "Work done:"}</strong> {timelineSummary}
                        </p>
                        {(!showBookingDetails || record.mechanic_name) ? (
                          <p className="dashboard-card__supporting">
                            Mechanic: {record.mechanic_name || "Not assigned yet"}.
                          </p>
                        ) : null}
                      </div>

                      <div className="dashboard-card__meta">
                        <div>
                          <span>{showBookingDetails ? "Booking date" : "Service date"}</span>
                          <strong>
                            {showBookingDetails
                              ? formatDisplayDate(record.booking_date)
                              : formatDisplayDate(record.service_date)}
                          </strong>
                        </div>
                        <div>
                          <span>{showBookingDetails ? "Time slot" : "Current status"}</span>
                          <strong>
                            {showBookingDetails
                              ? record.booking_time_slot || "Not selected"
                              : formatStatusLabel(record.status)}
                          </strong>
                        </div>
                      </div>

                      <div className="dashboard-card__footer">
                        <div>
                          <span>{showBookingDetails ? "Pickup & drop" : "Bill amount"}</span>
                          <strong>
                            {showBookingDetails
                              ? formatTransportOptionLabel(record.transport_option)
                              : formatCurrencyInr(record.amount)}
                          </strong>
                        </div>
                        <div>
                          <span>{showBookingDetails ? "Current status" : "Next service"}</span>
                          <strong>
                            {showBookingDetails
                              ? formatStatusLabel(record.status)
                              : formatDisplayDate(record.next_service_date)}
                          </strong>
                        </div>
                      </div>

                      {shouldShowEngagementSection ? (
                        <div className="dashboard-card__engagement">
                          <div className="dashboard-card__insight-grid">
                            <article className="dashboard-card__insight">
                              <span>Rating & feedback</span>
                              <strong>{feedbackSummary}</strong>
                              <p>
                                {record.customer_feedback
                                  ? record.customer_feedback
                                  : canRateMechanic
                                    ? "Share how the mechanic handled this service."
                                    : "Rating opens once the completed service has a mechanic assigned."}
                              </p>
                            </article>

                            <article className="dashboard-card__insight">
                              <span>Raised complaint</span>
                              <strong>
                                {hasRaisedComplaint
                                  ? formatComplaintStatusLabel(record.customer_complaint_status)
                                  : "Not raised"}
                              </strong>
                              <p>{getComplaintInsight(record, canRaiseComplaint)}</p>
                            </article>

                            {!showBookingDetails ? (
                              <article className="dashboard-card__insight">
                                <span>Invoice & documents</span>
                                <strong>
                                  {canDownloadInvoice ? getInvoiceNumber(record.id) : "Not ready"}
                                </strong>
                                <p>
                                  {canDownloadInvoice
                                    ? `PDF invoice available for ${formatCurrencyInr(record.amount)}.`
                                    : "Invoice becomes available once the service is completed."}
                                </p>
                              </article>
                            ) : null}

                            {!showBookingDetails ? (
                              <article className="dashboard-card__insight">
                                <span>Warranty record</span>
                                <strong>{warrantyStatus}</strong>
                                <p>
                                  {hasWarrantyRecord
                                    ? `${record.warranty_name || "Service warranty"} • ${formatDisplayDate(
                                      record.warranty_start_date
                                    )} to ${formatDisplayDate(record.warranty_end_date)}${record.warranty_notes ? `. ${record.warranty_notes}` : ""}`
                                    : "No warranty record has been attached to this service yet."}
                                </p>
                              </article>
                            ) : null}
                          </div>

                          {(canOpenChat || canRateMechanic || canRaiseComplaint || canDownloadInvoice) ? (
                            <div className="dashboard-card__actions dashboard-card__actions--stacked">
                              {canDownloadInvoice ? (
                                <button
                                  className="dashboard-card__action-button dashboard-card__action-button--dark"
                                  disabled={downloadingInvoiceRecordId === record.id}
                                  onClick={() => handleInvoiceDownload(record)}
                                  type="button"
                                >
                                  {downloadingInvoiceRecordId === record.id
                                    ? "Preparing invoice..."
                                    : "Download PDF invoice"}
                                </button>
                              ) : null}

                              {canRateMechanic ? (
                                <button
                                  className="dashboard-card__action-button"
                                  onClick={() => navigate(getFeedbackRoute(record.id))}
                                  type="button"
                                >
                                  Rate mechanic
                                </button>
                              ) : null}

                              {canRaiseComplaint ? (
                                <button
                                  className="dashboard-card__action-button dashboard-card__action-button--ghost"
                                  onClick={() => navigate(getComplaintRoute(record.id))}
                                  type="button"
                                >
                                  Raise complaint
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {isPendingCustomerBooking ? (
                        <div className="dashboard-card__actions">
                          <Link className="dashboard-card__edit" to={getAddServiceRoute(record.id)}>
                            Edit booking
                          </Link>
                        </div>
                      ) : null}
                    </article>
                  </div>
                );
              })
            ) : (
              <div className="dashboard-empty">
                <div className="dashboard-empty__badge">No records yet</div>
                <h3>Book your first service slot to start tracking upcoming visits.</h3>
                <p>Bookings and service records will appear here with slot details, job status, and future maintenance reminders.</p>
                <Link
                  className="dashboard-empty__button"
                  to={vehicles.length > 0 ? getAddServiceRoute() : getAddVehicleRoute()}
                >
                  {vehicles.length > 0 ? "Book First Service" : "Add First Vehicle"}
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
