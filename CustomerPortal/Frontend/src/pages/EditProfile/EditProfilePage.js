import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, USER_API } from "../../services/api";
import {
  getProfileRoute,
  getStoredToken,
  isAuthError,
  storeSession,
} from "../../utils/session";
import "./EditProfile.css";

export default function CustomerEditProfilePage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    state: "",
    city: "",
    locality: "",
    pincode: "",
    vehicleType: "",
    vehicleModel: "",
    vehicleNumber: "",
    phoneVerified: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!getStoredToken()) {
      navigate("/", { replace: true });
      return;
    }

    const handleError = (error) => {
      if (isAuthError(error)) {
        toast.error(error.response?.data?.error || "Please login again.");
        navigate("/", { replace: true });
        return;
      }
      toast.error(error.response?.data?.error || "Failed to load profile");
    };

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      USER_API.profile,
      (response) => {
        setFormData({
          name: response.name || "",
          email: response.email || "",
          phone: response.phone || "",
          address: response.address || "",
          state: response.state || "",
          city: response.city || "",
          locality: response.locality || "",
          pincode: response.pincode || "",
          vehicleType: response.vehicle_type || "",
          vehicleModel: response.vehicle_model || "",
          vehicleNumber: response.vehicle_number || "",
          phoneVerified: Boolean(response.phone_verified),
        });
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
  }, [navigate, toast]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (!formData.email.trim()) {
      toast.error("Email is required");
      return;
    }

    if (!formData.phone.trim()) {
      toast.error("Phone number is required");
      return;
    }

    if (!/^\d{10}$/.test(formData.phone.trim())) {
      toast.error("Phone number must be 10 digits");
      return;
    }

    if (
      !formData.address.trim() ||
      !formData.state.trim() ||
      !formData.city.trim() ||
      !formData.locality.trim() ||
      !formData.pincode.trim()
    ) {
      toast.error("Complete the full address details");
      return;
    }

    if (!/^\d{6}$/.test(formData.pincode.trim())) {
      toast.error("Pincode must be 6 digits");
      return;
    }

    const hasAnyVehicleDetail = Boolean(
      formData.vehicleType.trim() ||
      formData.vehicleModel.trim() ||
      formData.vehicleNumber.trim()
    );
    const hasAllVehicleDetails = Boolean(
      formData.vehicleType.trim() &&
      formData.vehicleModel.trim() &&
      formData.vehicleNumber.trim()
    );

    if (hasAnyVehicleDetail && !hasAllVehicleDetails) {
      toast.error("Complete vehicle type, model, and number together or clear them all");
      return;
    }

    setIsSubmitting(true);

    makeApiCall(
      API_CALL_TYPE.PUT_CALL,
      USER_API.updateProfile,
      (response) => {
        const token = getStoredToken();

        if (token) {
          storeSession(token, response);
        }
        toast.success("Profile updated successfully");
        setIsSubmitting(false);
        window.setTimeout(() => navigate(getProfileRoute()), 1000);
      },
      (error) => {
        toast.error(error.response?.data?.error || "Failed to update profile");
        setIsSubmitting(false);
      },
      "",
      null,
      {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        state: formData.state.trim(),
        city: formData.city.trim(),
        locality: formData.locality.trim(),
        pincode: formData.pincode.trim(),
        vehicleType: formData.vehicleType.trim(),
        vehicleModel: formData.vehicleModel.trim(),
        vehicleNumber: formData.vehicleNumber.trim(),
      }
    ).catch(() => undefined);
  };

  if (isLoading) {
    return (
      <section className="edit-profile-page">
        <div className="edit-profile-page__backdrop"></div>
        <div className="edit-profile-page__mesh"></div>
        <div className="edit-profile-container">
          <p>Loading...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="edit-profile-page">
      <div className="edit-profile-page__backdrop"></div>
      <div className="edit-profile-page__mesh"></div>

      <div className="edit-profile-container">
        <header className="edit-profile-hero">
          <div className="edit-profile-hero__content">
            <p className="edit-profile-hero__eyebrow">Edit profile</p>
            <h1>Update your customer details.</h1>
            <p className="edit-profile-hero__description">
              Save the latest contact, address, and vehicle information used for bookings and support.
            </p>

            <div className="edit-profile-hero__actions">
              <Link className="edit-profile-hero__secondary" to={getProfileRoute()}>
                Back to profile
              </Link>
            </div>
          </div>

          <aside className="edit-profile-summary">
            <div className="edit-profile-summary__top">
              <div className="edit-profile-summary__avatar">
                {formData.name?.charAt(0)?.toUpperCase() || "C"}
              </div>
              <div className="edit-profile-summary__identity">
                <h2>{formData.name || "Customer"}</h2>
                <span>Customer account</span>
              </div>
            </div>
            <div className="edit-profile-summary__details">
              <div>
                <span>Email</span>
                <strong>{formData.email || "Add your email"}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{formData.phone || "Add your number"}</strong>
              </div>
            </div>
          </aside>
        </header>

        <section className="edit-profile-grid">
          <form className="edit-profile-card" onSubmit={handleSubmit}>
            <div className="edit-profile-card__header">
              <p className="edit-profile-card__eyebrow">Profile Editor</p>
              <h2>Edit account details</h2>
              <span>Keep your account, address, and vehicle snapshot current.</span>
            </div>

            <div className="edit-profile-form">
              <div className="edit-profile-form__section edit-profile-form__section--full">
                <p>Contact details</p>
                <span>Basic customer information used for updates and reminders.</span>
              </div>

              <label className="edit-profile-form__field" htmlFor="name">
                <span>Full Name *</span>
                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.name}
                  disabled={isSubmitting}
                  onChange={handleChange}
                />
              </label>

              <label className="edit-profile-form__field" htmlFor="email">
                <span>Email *</span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  disabled={isSubmitting}
                  onChange={handleChange}
                />
              </label>

              <label className="edit-profile-form__field" htmlFor="phone">
                <span>Phone Number *</span>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="Enter 10-digit phone number"
                  value={formData.phone}
                  disabled={isSubmitting}
                  onChange={handleChange}
                />
              </label>

              <div className="edit-profile-form__section edit-profile-form__section--full">
                <p>Location details</p>
                <span>Address information used for service coordination and support.</span>
              </div>

              <label className="edit-profile-form__field" htmlFor="state">
                <span>State *</span>
                <input
                  id="state"
                  name="state"
                  type="text"
                  placeholder="Enter state"
                  value={formData.state}
                  disabled={isSubmitting}
                  onChange={handleChange}
                />
              </label>

              <label className="edit-profile-form__field" htmlFor="city">
                <span>City *</span>
                <input
                  id="city"
                  name="city"
                  type="text"
                  placeholder="Enter city"
                  value={formData.city}
                  disabled={isSubmitting}
                  onChange={handleChange}
                />
              </label>

              <label className="edit-profile-form__field" htmlFor="locality">
                <span>Locality / Area *</span>
                <input
                  id="locality"
                  name="locality"
                  type="text"
                  placeholder="Enter locality or area"
                  value={formData.locality}
                  disabled={isSubmitting}
                  onChange={handleChange}
                />
              </label>

              <label className="edit-profile-form__field" htmlFor="pincode">
                <span>Pincode *</span>
                <input
                  id="pincode"
                  name="pincode"
                  type="tel"
                  placeholder="Enter 6-digit pincode"
                  value={formData.pincode}
                  maxLength={6}
                  disabled={isSubmitting}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      pincode: event.target.value.replace(/\D/g, "").slice(0, 6),
                    }))
                  }
                />
              </label>

              <label className="edit-profile-form__field edit-profile-form__field--full" htmlFor="address">
                <span>Address *</span>
                <textarea
                  id="address"
                  name="address"
                  placeholder="Enter your address"
                  value={formData.address}
                  disabled={isSubmitting}
                  onChange={handleChange}
                  rows={4}
                />
              </label>

              <div className="edit-profile-form__section edit-profile-form__section--full">
                <p>Vehicle snapshot</p>
                <span>Optional details that can speed up the next booking request.</span>
              </div>

              <label className="edit-profile-form__field" htmlFor="vehicleType">
                <span>Vehicle Type</span>
                <input
                  id="vehicleType"
                  name="vehicleType"
                  type="text"
                  placeholder="Car, bike, scooter"
                  value={formData.vehicleType}
                  disabled={isSubmitting}
                  onChange={handleChange}
                />
              </label>

              <label className="edit-profile-form__field" htmlFor="vehicleModel">
                <span>Vehicle Model</span>
                <input
                  id="vehicleModel"
                  name="vehicleModel"
                  type="text"
                  placeholder="Enter vehicle model"
                  value={formData.vehicleModel}
                  disabled={isSubmitting}
                  onChange={handleChange}
                />
              </label>

              <label className="edit-profile-form__field edit-profile-form__field--full" htmlFor="vehicleNumber">
                <span>Vehicle Number</span>
                <input
                  id="vehicleNumber"
                  name="vehicleNumber"
                  type="text"
                  placeholder="Enter registration number"
                  value={formData.vehicleNumber}
                  disabled={isSubmitting}
                  onChange={handleChange}
                />
              </label>
            </div>

            <div className="edit-profile-card__actions">
              <button
                className="edit-profile-form__submit"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Save Profile Changes"}
              </button>

              <button
                className="edit-profile-form__back"
                type="button"
                onClick={() => navigate(getProfileRoute())}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
