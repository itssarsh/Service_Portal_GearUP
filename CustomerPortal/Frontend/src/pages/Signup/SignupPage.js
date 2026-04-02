import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PasswordInput from "../../components/PasswordInput";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, USER_API } from "../../services/api";
import { getLoginRoute } from "../../utils/session";
import "./Signup.css";

export default function CustomerSignupPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    state: "",
    city: "",
    locality: "",
    pincode: "",
    password: "",
    confirmPassword: "",
    vehicleType: "",
    vehicleModel: "",
    vehicleNumber: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const updateFormField = (field) => (event) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const requiredFields = [
      form.name,
      form.email,
      form.phone,
      form.address,
      form.state,
      form.city,
      form.locality,
      form.pincode,
      form.password,
      form.confirmPassword,
    ];

    if (requiredFields.some((value) => value.trim() === "")) {
      toast.error("Complete the required registration fields");
      return;
    }

    if (!/^\d{10}$/.test(form.phone)) {
      toast.error("Phone number must be 10 digits");
      return;
    }

    if (!/^\d{6}$/.test(form.pincode)) {
      toast.error("Pincode must be 6 digits");
      return;
    }

    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    const hasAnyVehicleDetail = Boolean(
      form.vehicleType.trim() || form.vehicleModel.trim() || form.vehicleNumber.trim()
    );
    const hasAllVehicleDetails = Boolean(
      form.vehicleType.trim() && form.vehicleModel.trim() && form.vehicleNumber.trim()
    );

    if (hasAnyVehicleDetail && !hasAllVehicleDetails) {
      toast.error("Complete vehicle type, model, and number together or leave them blank");
      return;
    }

    setIsSubmitting(true);

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      USER_API.signup,
      () => {
        toast.success("Account created successfully");
        setIsSubmitting(false);
        window.setTimeout(() => navigate(getLoginRoute()), 900);
      },
      (error) => {
        toast.error(error.response?.data?.error || "Signup failed");
        setIsSubmitting(false);
      },
      "",
      null,
      {
        ...form,
        email: form.email.trim().toLowerCase(),
      }
    ).catch(() => undefined);
  };

  return (
    <section className="auth-shell signup-page">
      <div className="auth-shell__backdrop"></div>
      <div className="auth-shell__mesh"></div>

      <div className="auth-shell__layout">
        {/* <div className="auth-shell__hero">
          <span className="auth-shell__badge">Customer Signup</span>
          <h1>Create your customer account.</h1>
          <p>
            Complete your core account and contact setup before you start booking services.
          </p>

          <div className="auth-shell__metrics">
            <div className="auth-shell__metric">
              <span>Verified contact</span>
              <strong>Phone verification can be connected with OTP before launch.</strong>
            </div>
            <div className="auth-shell__metric">
              <span>Service ready</span>
              <strong>Address, locality, city, and pincode help with bookings and support follow-ups.</strong>
            </div>
            <div className="auth-shell__metric">
              <span>Vehicle optional</span>
              <strong>Add one vehicle snapshot now for a smoother first service request.</strong>
            </div>
          </div>
        </div> */}

        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card__header">
            <span className="auth-card__eyebrow">Customer Onboarding</span>
            <h2>Create customer access</h2>
            <p>Enter your account details first. Vehicle information is optional.</p>
          </div>

          <div className="auth-card__grid">
            <div className="signup-form-section auth-card__field--span-2">
              <span className="signup-form-section__label">Account details</span>
            </div>

            <label className="auth-card__field">
              <span>Full name</span>
              <input
                placeholder="Enter your full name"
                value={form.name}
                onChange={updateFormField("name")}
              />
            </label>

            <label className="auth-card__field">
              <span>Email</span>
              <input
                placeholder="Enter your email"
                type="email"
                value={form.email}
                onChange={updateFormField("email")}
              />
            </label>

            <label className="auth-card__field">
              <span>Mobile number</span>
              <input
                placeholder="Enter 10-digit mobile number"
                type="tel"
                maxLength={10}
                value={form.phone}
                onChange={updateFormField("phone")}
              />
            </label>

            <label className="auth-card__field">
              <span>Password</span>
              <PasswordInput
                placeholder="Create a password"
                value={form.password}
                autoComplete="new-password"
                onChange={updateFormField("password")}
              />
            </label>

            <label className="auth-card__field auth-card__field--span-2">
              <span>Confirm password</span>
              <PasswordInput
                placeholder="Confirm your password"
                value={form.confirmPassword}
                autoComplete="new-password"
                onChange={updateFormField("confirmPassword")}
              />
            </label>

            <div className="signup-form-section auth-card__field--span-2">
              <span className="signup-form-section__label">Location details</span>
            </div>

            <label className="auth-card__field auth-card__field--span-2">
              <span>Address</span>
              <textarea
                placeholder="House number, building, street, landmark"
                value={form.address}
                onChange={updateFormField("address")}
              />
            </label>

            <label className="auth-card__field">
              <span>State</span>
              <input
                placeholder="Enter state"
                value={form.state}
                onChange={updateFormField("state")}
              />
            </label>

            <label className="auth-card__field">
              <span>City</span>
              <input
                placeholder="Enter city"
                value={form.city}
                onChange={updateFormField("city")}
              />
            </label>

            <label className="auth-card__field">
              <span>Locality / area</span>
              <input
                placeholder="Enter locality or area"
                value={form.locality}
                onChange={updateFormField("locality")}
              />
            </label>

            <label className="auth-card__field">
              <span>Pincode</span>
              <input
                placeholder="Enter 6-digit pincode"
                type="tel"
                maxLength={6}
                value={form.pincode}
                onChange={(event) => {
                  const numericValue = event.target.value.replace(/\D/g, "").slice(0, 6);
                  setForm((currentForm) => ({
                    ...currentForm,
                    pincode: numericValue,
                  }));
                }}
              />
            </label>

            <div className="signup-form-section auth-card__field--span-2">
              <span className="signup-form-section__label">Optional vehicle details</span>
            </div>

            <label className="auth-card__field">
              <span>Vehicle type</span>
              <input
                placeholder="Car, bike, scooter"
                value={form.vehicleType}
                onChange={updateFormField("vehicleType")}
              />
            </label>

            <label className="auth-card__field">
              <span>Vehicle model</span>
              <input
                placeholder="Enter vehicle model"
                value={form.vehicleModel}
                onChange={updateFormField("vehicleModel")}
              />
            </label>

            <label className="auth-card__field auth-card__field--span-2">
              <span>Vehicle number</span>
              <input
                placeholder="Enter registration number"
                value={form.vehicleNumber}
                onChange={updateFormField("vehicleNumber")}
              />
            </label>
          </div>

          <button className="auth-card__button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Create Account"}
          </button>

          <p className="auth-card__footer">
            Already onboarded? <Link className="auth-card__link" to={getLoginRoute()}>Sign in here</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
