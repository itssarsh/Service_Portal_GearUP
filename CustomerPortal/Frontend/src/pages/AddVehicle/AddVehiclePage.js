import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import makeApiCall, { API_CALL_TYPE, USER_API, VEHICLE_API } from "../../services/api";
import {
  clearSession,
  getDashboardRoute,
  getLoginRoute,
  isAuthError,
  getStoredToken,
  getStoredUser,
} from "../../utils/session";
import {
  normalizePhoneNumber,
  normalizeRegistrationNumber,
  normalizeWhitespace,
  toTitleCase,
} from "../../utils/normalize";
import "./AddVehicle.css";

export default function CustomerAddVehiclePage() {
  const [profile, setProfile] = useState(() => getStoredUser());
  const [form, setForm] = useState({
    registrationNumber: "",
    vehicleType: "Car",
    brand: "",
    model: "",
    modelYear: "",
    notes: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const basicFieldsCompleted = [
    form.registrationNumber,
    form.brand,
    form.model,
  ].filter((value) => value.trim()).length;

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      USER_API.profile,
      (response) => {
        setProfile(response);
      },
      (error) => {
        if (isAuthError(error)) {
          toast.error(error.response?.data?.error || "Please login again.");
          clearSession();
          navigate(getLoginRoute(), { replace: true });
          return;
        }

        toast.error(error.response?.data?.error || "Something went wrong.");
      },
      "",
      null,
      {}
    ).catch(() => undefined);
  }, [navigate, toast]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previousForm) => ({
      ...previousForm,
      [name]: name === "registrationNumber" ? value.toUpperCase() : value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.registrationNumber.trim() || !form.brand.trim() || !form.model.trim()) {
      toast.error("Vehicle registration, brand, and model are required.");
      return;
    }

    setIsSaving(true);

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      VEHICLE_API.create,
      () => {
        toast.success("Vehicle saved successfully");
        setIsSaving(false);
        navigate(getDashboardRoute(), { replace: true });
      },
      (error) => {
        toast.error(error.response?.data?.error || "Failed to save vehicle");
        setIsSaving(false);
      },
      "",
      null,
      {
        ...form,
        registrationNumber: normalizeRegistrationNumber(form.registrationNumber),
        brand: toTitleCase(form.brand),
        model: toTitleCase(form.model),
        modelYear: form.modelYear ? Number(form.modelYear) : null,
        ownerName: profile?.name ? toTitleCase(profile.name) : "",
        ownerPhone: normalizePhoneNumber(profile?.phone || ""),
        ownerUserId: profile?.id || null,
        notes: normalizeWhitespace(form.notes),
      }
    ).catch(() => undefined);
  };

  return (
    <section className="add-product-page">
      <div className="add-product-page__backdrop"></div>

      <div className="add-product-layout">
        <div className="add-product-hero">
          <div className="add-product-hero__top">
            <Link className="add-product-hero__back" to={getDashboardRoute()}>
              Back to Dashboard
            </Link>
            <span className="add-product-hero__badge">Vehicle Registry</span>
          </div>

          <div className="add-product-hero__heading">
            <h1>Register a vehicle once and use it across every future booking, invoice, and support flow.</h1>
            <p>Create a clean master record now so service history, emergency requests, and workshop updates stay tied to the right vehicle.</p>
          </div>

          <div className="add-product-hero__meta">
            <article className="add-product-hero__meta-card add-product-hero__meta-card--wide">
              <span>Current registration</span>
              <strong>{form.registrationNumber.trim() || "Registration not added yet"}</strong>
            </article>
            <article className="add-product-hero__meta-card">
              <span>Progress</span>
              <strong>{basicFieldsCompleted}/3 filled</strong>
            </article>
            <article className="add-product-hero__meta-card">
              <span>Owner details</span>
              <strong>
                {profile?.name && profile?.phone
                  ? `${profile.name} • ${profile.phone}`
                  : "Auto from profile"}
              </strong>
            </article>
            <article className="add-product-hero__meta-card">
              <span>Vehicle type</span>
              <strong>{form.vehicleType || "Not selected"}</strong>
            </article>
            <article className="add-product-hero__meta-card">
              <span>Entry mode</span>
              <strong>Customer self-registration</strong>
            </article>
          </div>
        </div>

        <form className="add-product-card" onSubmit={handleSubmit}>
          <div className="add-product-card__header">
            <p className="add-product-card__eyebrow">New Vehicle Record</p>
            <h2>Create vehicle profile</h2>
            <span>Save the essential details now. Service bookings and history will attach to this record automatically.</span>
          </div>

          <div className="add-product-card__section">
            <div className="add-product-card__section-head">
              <div>
                <h3>Vehicle basics</h3>
                <p>Add the core details first so this vehicle can be searched, booked, and tracked without confusion.</p>
              </div>
              <span className="add-product-card__section-tag">Required</span>
            </div>

            <div className="add-product-card__grid">
              <label className="add-product-card__field">
                <span>Registration Number</span>
                <input
                  name="registrationNumber"
                  placeholder="GJ01AB1234"
                  value={form.registrationNumber}
                  onChange={handleChange}
                />
              </label>

              <label className="add-product-card__field">
                <span>Vehicle Type</span>
                <select name="vehicleType" value={form.vehicleType} onChange={handleChange}>
                  <option value="Car">Car</option>
                  <option value="Tractor">Tractor</option>
                  <option value="Bike">Bike</option>
                  <option value="Truck">Truck</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <label className="add-product-card__field">
                <span>Brand</span>
                <input name="brand" placeholder="Toyota" value={form.brand} onChange={handleChange} />
              </label>

              <label className="add-product-card__field">
                <span>Model</span>
                <input name="model" placeholder="Innova" value={form.model} onChange={handleChange} />
              </label>

              <label className="add-product-card__field">
                <span>Model Year</span>
                <input
                  name="modelYear"
                  type="number"
                  placeholder="2022"
                  value={form.modelYear}
                  onChange={handleChange}
                />
              </label>

              <label className="add-product-card__field add-product-card__field--span-2">
                <div className="add-product-card__field-label">
                  <span className="add-product-card__field-label-title">Notes</span>
                  <span className="add-product-card__field-badge">Optional</span>
                </div>
                <textarea
                  name="notes"
                  placeholder="Add any useful details about the vehicle"
                  value={form.notes}
                  onChange={handleChange}
                />
              </label>
            </div>
          </div>

          <button className="add-product-card__button" type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Create Vehicle Record"}
          </button>
        </form>
      </div>
    </section>
  );
}
