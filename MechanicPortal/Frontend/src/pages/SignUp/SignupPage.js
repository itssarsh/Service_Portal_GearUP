import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PasswordInput from "../../components/PasswordInput";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, SIGNUP_API } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import { getLoginRoute } from "../../utils/session";
import "./Signup.css";

const VEHICLE_TYPE_OPTIONS = [
  "Bike",
  "Scooter",
  "Car",
  "SUV",
  "Van",
  "Truck",
];

const SERVICE_OFFERING_OPTIONS = [
  "General Service",
  "Oil Change",
  "Brake Repair",
  "Engine Diagnostics",
  "Battery Support",
  "AC Service",
  "Tyre & Puncture",
  "Emergency Roadside Help",
];

const WORKING_DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const SERVICE_MODE_OPTIONS = [
  { value: "shop", label: "Shop only" },
  { value: "doorstep", label: "Doorstep only" },
  { value: "shop_and_doorstep", label: "Shop + doorstep" },
];

const ID_PROOF_OPTIONS = [
  "Aadhaar Card",
  "Driving Licence",
  "PAN Card",
  "Voter ID",
];

const initialForm = {
  name: "",
  phone: "",
  email: "",
  password: "",
  confirmPassword: "",
  workshopName: "",
  address: "",
  serviceLocation: "",
  vehicleTypes: [],
  servicesOffered: [],
  yearsExperience: "",
  availabilityDays: [],
  availabilityStart: "",
  availabilityEnd: "",
  serviceMode: "shop",
  idProofType: "",
  idProofReference: "",
};

function toggleSelection(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function MechanicSignupPage() {
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const handleChange = (field, value) => {
    setForm((previousForm) => ({
      ...previousForm,
      [field]: value,
    }));
  };

  const handlePhoneChange = (value) => {
    handleChange("phone", value.replace(/\D/g, "").slice(0, 10));
  };

  const handleToggle = (field, value) => {
    setForm((previousForm) => ({
      ...previousForm,
      [field]: toggleSelection(previousForm[field], value),
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (
      !form.name.trim() ||
      !form.phone.trim() ||
      !form.email.trim() ||
      !form.password.trim() ||
      !form.confirmPassword.trim() ||
      !form.workshopName.trim() ||
      !form.address.trim() ||
      !form.serviceLocation.trim() ||
      !form.idProofType.trim() ||
      !form.idProofReference.trim()
    ) {
      toast.error("Complete all required onboarding fields.");
      return;
    }

    if (!/^\d{10}$/.test(form.phone)) {
      toast.error("Phone number must be 10 digits.");
      return;
    }

    if (form.vehicleTypes.length === 0) {
      toast.error("Select at least one vehicle type.");
      return;
    }

    if (form.servicesOffered.length === 0) {
      toast.error("Select at least one service offering.");
      return;
    }

    if (form.availabilityDays.length === 0 || !form.availabilityStart || !form.availabilityEnd) {
      toast.error("Set your working days and hours.");
      return;
    }

    const yearsExperience = Number(form.yearsExperience);

    if (!Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > 60) {
      toast.error("Years of experience must be between 0 and 60.");
      return;
    }

    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      SIGNUP_API(),
      () => {
        toast.success("Workshop onboarding submitted successfully.");
        window.setTimeout(() => navigate(getLoginRoute()), 900);
        setIsSubmitting(false);
      },
      (error) => {
        toast.error(error.response?.data?.error || "Signup failed");
        setIsSubmitting(false);
      },
      "",
      null,
      {
        ...form,
        yearsExperience,
        phoneVerified: false,
      }
    ).catch(() => undefined);
  };

  return (
    <section className="auth-page signup-page">
      <div className="auth-page__backdrop"></div>

      <div className="auth-layout signup-layout">
        <div className="auth-hero signup-hero">
          <span className="auth-badge">Workshop Launch</span>
          <h1>Set up a workshop profile built for live operations.</h1>
          <p>Register business details, service coverage, and team availability in one place.</p>

          <div className="auth-highlights signup-highlights">
            <div className="auth-highlight">
              <strong>Clear onboarding</strong>
              <span>Capture mechanic, business, and verification details in one record.</span>
            </div>
            <div className="auth-highlight">
              <strong>Service-ready setup</strong>
              <span>Define vehicle types, offerings, and working hours before jobs go live.</span>
            </div>
            <div className="auth-highlight">
              <strong>Faster review</strong>
              <span>Keep phone verification and ID reference ready for approval.</span>
            </div>
          </div>
        </div>

        <form className="auth-card signup-card" onSubmit={handleSubmit}>
          <div className="auth-card__header">
            <p className="auth-card__eyebrow">Workshop Signup</p>
            <h2>Create workshop account</h2>
            <span>Complete the core business, service, and verification details.</span>
          </div>

          {/* <div className="auth-card__notice signup-card__notice">
            Mobile OTP verification can be connected before launch.
          </div> */}

          <div className="signup-form__section">
            <div className="signup-form__section-header">
              <strong>Account owner</strong>
              <span>Basic account details</span>
            </div>

            <div className="signup-form__grid signup-form__grid--two">
              <label className="auth-field">
                <span>Full name</span>
                <input
                  placeholder="Enter mechanic full name"
                  value={form.name}
                  onChange={(event) => handleChange("name", event.target.value)}
                />
              </label>

              <label className="auth-field">
                <span>Mobile number</span>
                <input
                  placeholder="Enter 10-digit mobile number"
                  type="tel"
                  maxLength={10}
                  value={form.phone}
                  onChange={(event) => handlePhoneChange(event.target.value)}
                />
              </label>

              <label className="auth-field">
                <span>Email ID</span>
                <input
                  placeholder="Enter business email"
                  type="email"
                  value={form.email}
                  onChange={(event) => handleChange("email", event.target.value)}
                />
              </label>

              <label className="auth-field">
                <span>Years of experience</span>
                <input
                  min="0"
                  max="60"
                  placeholder="Enter total experience"
                  type="number"
                  value={form.yearsExperience}
                  onChange={(event) => handleChange("yearsExperience", event.target.value)}
                />
              </label>

              <label className="auth-field">
                <span>Password</span>
                <PasswordInput
                  placeholder="Create a password"
                  value={form.password}
                  autoComplete="new-password"
                  onChange={(event) => handleChange("password", event.target.value)}
                />
              </label>

              <label className="auth-field">
                <span>Confirm password</span>
                <PasswordInput
                  placeholder="Confirm your password"
                  value={form.confirmPassword}
                  autoComplete="new-password"
                  onChange={(event) => handleChange("confirmPassword", event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="signup-form__section">
            <div className="signup-form__section-header">
              <strong>Workshop profile</strong>
              <span>Business and location</span>
            </div>

            <div className="signup-form__grid signup-form__grid--two">
              <label className="auth-field">
                <span>Workshop or business name</span>
                <input
                  placeholder="Enter workshop name"
                  value={form.workshopName}
                  onChange={(event) => handleChange("workshopName", event.target.value)}
                />
              </label>

              <label className="auth-field">
                <span>Service location</span>
                <input
                  placeholder="City, area, or operating zone"
                  value={form.serviceLocation}
                  onChange={(event) => handleChange("serviceLocation", event.target.value)}
                />
              </label>
            </div>

            <label className="auth-field">
              <span>Workshop or business address</span>
              <textarea
                placeholder="Enter complete workshop address"
                value={form.address}
                onChange={(event) => handleChange("address", event.target.value)}
              />
            </label>
          </div>

          <div className="signup-form__section">
            <div className="signup-form__section-header">
              <strong>Service coverage</strong>
              <span>Vehicles and services</span>
            </div>

            <div className="auth-field">
              <span>Vehicle types offered</span>
              <div className="signup-choice-group">
                {VEHICLE_TYPE_OPTIONS.map((option) => (
                  <button
                    className={`signup-choice${
                      form.vehicleTypes.includes(option) ? " signup-choice--active" : ""
                    }`}
                    key={option}
                    onClick={() => handleToggle("vehicleTypes", option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="auth-field">
              <span>Services offered</span>
              <div className="signup-choice-group">
                {SERVICE_OFFERING_OPTIONS.map((option) => (
                  <button
                    className={`signup-choice${
                      form.servicesOffered.includes(option) ? " signup-choice--active" : ""
                    }`}
                    key={option}
                    onClick={() => handleToggle("servicesOffered", option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label className="auth-field">
              <span>Service mode</span>
              <select
                value={form.serviceMode}
                onChange={(event) => handleChange("serviceMode", event.target.value)}
              >
                {SERVICE_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="signup-form__section">
            <div className="signup-form__section-header">
              <strong>Availability</strong>
              <span>Working schedule</span>
            </div>

            <div className="auth-field">
              <span>Working days</span>
              <div className="signup-choice-group">
                {WORKING_DAY_OPTIONS.map((day) => (
                  <button
                    className={`signup-choice${
                      form.availabilityDays.includes(day) ? " signup-choice--active" : ""
                    }`}
                    key={day}
                    onClick={() => handleToggle("availabilityDays", day)}
                    type="button"
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="signup-form__grid signup-form__grid--two">
              <label className="auth-field">
                <span>Working hours from</span>
                <input
                  type="time"
                  value={form.availabilityStart}
                  onChange={(event) => handleChange("availabilityStart", event.target.value)}
                />
              </label>

              <label className="auth-field">
                <span>Working hours until</span>
                <input
                  type="time"
                  value={form.availabilityEnd}
                  onChange={(event) => handleChange("availabilityEnd", event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="signup-form__section signup-form__section--compact">
            <div className="signup-form__section-header">
              <strong>Verification details</strong>
              <span>ID verification</span>
            </div>

            <div className="signup-form__grid signup-form__grid--two">
              <label className="auth-field">
                <span>ID proof type</span>
                <select
                  value={form.idProofType}
                  onChange={(event) => handleChange("idProofType", event.target.value)}
                >
                  <option value="">Select ID proof</option>
                  {ID_PROOF_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="auth-field">
                <span>ID proof reference</span>
                <input
                  placeholder="Enter ID number or reference"
                  value={form.idProofReference}
                  onChange={(event) => handleChange("idProofReference", event.target.value)}
                />
              </label>
            </div>
          </div>

          <button className="auth-card__button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting onboarding..." : "Create"}
          </button>

          <p className="auth-card__footer">
            Already approved for access? <Link to={getLoginRoute()}>Sign in</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
