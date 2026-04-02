import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, CREATE_VEHICLE_API, GET_VEHICLES_API } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import { showApiError } from "../../utils/apiError";
import { clearSession, getLoginRoute, getStoredToken, } from "../../utils/session";
import { normalizePhoneNumber, normalizeRegistrationNumber, normalizeWhitespace, toTitleCase, } from "../../utils/normalize";
import { formatDisplayDate } from "../../utils/formatters";
import "./AddProduct.css";

export default function MechanicAddVehiclePage() {
  const vehiclePreviewLimit = 6;
  const [form, setForm] = useState({
    registrationNumber: "",
    vehicleType: "Car",
    brand: "",
    model: "",
    manufactureYear: "",
    ownerName: "",
    ownerPhone: "",
    notes: "",
  });
  const [vehicles, setVehicles] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [activeVehicleTab, setActiveVehicleTab] = useState("new");
  const navigate = useNavigate();
  const toast = useToast();
  const basicFieldsCompleted = [
    form.registrationNumber,
    form.brand,
    form.model,
  ].filter((value) => value.trim()).length;
  const ownerFieldsCompleted = [form.ownerName, form.ownerPhone].filter((value) => value.trim()).length;

  const loadVehicles = (onError) =>
    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_VEHICLES_API(),
      (response) => setVehicles(response),
      onError,
      "",
      null,
      {}
    ).catch(() => {
      return undefined;
    });

  useEffect(() => {
    if (!getStoredToken()) {
      clearSession();
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    const handleVehicleLoadError = (error) => {
      showApiError(toast, error, "Failed to load vehicles.");
    };

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_VEHICLES_API(),
      (response) => setVehicles(response),
      handleVehicleLoadError,
      "",
      null,
      {}
    ).catch(() => {
      return undefined;
    });
  }, [navigate, toast]);

  const latestVehicles = vehicles.slice(0, vehiclePreviewLimit);

  const handleChange = (event) => {
    const { name, value } = event.target;
    let nextValue = value;

    if (name === "registrationNumber") {
      nextValue = value.toUpperCase();
    }

    if (name === "ownerPhone") {
      nextValue = normalizePhoneNumber(value);
    }

    setForm((previousForm) => ({ ...previousForm, [name]: nextValue }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.registrationNumber.trim() || !form.brand.trim() || !form.model.trim()) {
      toast.error("Vehicle registration, brand, and model are required.");
      return;
    }

    if (!form.ownerName.trim() || !form.ownerPhone.trim()) {
      toast.error("Owner name and phone are required for mechanic entry.");
      return;
    }

    setIsSaving(true);

    makeApiCall(
      API_CALL_TYPE.POST_CALL,
      CREATE_VEHICLE_API(),
      () => {
        toast.success("Vehicle saved successfully");
        loadVehicles(() => {
          return undefined;
        });
        setActiveVehicleTab("registered");
        setForm({
          registrationNumber: "",
          vehicleType: "Car",
          brand: "",
          model: "",
          manufactureYear: "",
          ownerName: "",
          ownerPhone: "",
          notes: "",
        });
        setIsSaving(false);
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
        ownerName: toTitleCase(form.ownerName),
        ownerPhone: normalizePhoneNumber(form.ownerPhone),
        manufactureYear: form.manufactureYear ? Number(form.manufactureYear) : null,
        notes: normalizeWhitespace(form.notes),
      }
    ).catch(() => {
      setIsSaving(false);
      return undefined;
    });
  };

  return (
    <section className="add-product-page">
      <div className="add-product-page__backdrop"></div>

      <div className="add-product-layout">
        <div className="add-product-hero">
          <div className="add-product-hero__top">
            <span className="add-product-hero__badge">Vehicle Entry</span>
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
              <strong>{ownerFieldsCompleted}/2 completed</strong>
            </article>
            <article className="add-product-hero__meta-card">
              <span>Vehicle type</span>
              <strong>{form.vehicleType || "Not selected"}</strong>
            </article>
            <article className="add-product-hero__meta-card">
              <span>Entry mode</span>
              <strong>Mechanic-assisted entry</strong>
            </article>
            <article className="add-product-hero__meta-card">
              <span>Saved vehicles</span>
              <strong>{vehicles.length}</strong>
            </article>
          </div>
        </div>

        <div className="add-product-tabs" role="tablist" aria-label="Vehicle page tabs">
          <button
            aria-selected={activeVehicleTab === "new"}
            className={`add-product-tab${activeVehicleTab === "new" ? " add-product-tab--active" : ""
              }`}
            onClick={() => setActiveVehicleTab("new")}
            role="tab"
            type="button"
          >
            <span>New Vehicle</span>
            {/* <strong>Add</strong> */}
          </button>
          <button
            aria-selected={activeVehicleTab === "registered"}
            className={`add-product-tab${activeVehicleTab === "registered" ? " add-product-tab--active" : ""
              }`}
            onClick={() => setActiveVehicleTab("registered")}
            role="tab"
            type="button"
          >
            <span>Registered Vehicle</span>
            <strong>{vehicles.length}</strong>
          </button>
        </div>

        {activeVehicleTab === "new" ? (
          <form className="add-product-card" onSubmit={handleSubmit}>
            <div className="add-product-card__header">
              <p className="add-product-card__eyebrow">Vehicle intake</p>
              <h2>Create a vehicle record</h2>
              <span>Save complete vehicle and owner details now so future service records stay fast and accurate.</span>
            </div>

            <div className="add-product-card__section">
              <div className="add-product-card__section-head">
                <div>
                  <h3>Vehicle basics</h3>
                  <p>Add the core details first so this record is easy to search and reuse.</p>
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
                  <span>Manufacture Year</span>
                  <input
                    name="manufactureYear"
                    type="number"
                    placeholder="2022"
                    value={form.manufactureYear}
                    onChange={handleChange}
                  />
                </label>

                <label className="add-product-card__field">
                  <span>Owner Name</span>
                  <input
                    name="ownerName"
                    placeholder="Vehicle owner name"
                    value={form.ownerName}
                    onChange={handleChange}
                  />
                </label>

                <label className="add-product-card__field">
                  <span>Owner Phone</span>
                  <input
                    name="ownerPhone"
                    placeholder="9876543210"
                    value={form.ownerPhone}
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
              {isSaving ? "Saving..." : "Save vehicle"}
            </button>
          </form>
        ) : null}

        {activeVehicleTab === "registered" ? (
          <section className="add-product-card add-product-card--listing">
            <div className="add-product-card__header add-product-card__header--split">
              <div>
                <p className="add-product-card__eyebrow">Registered Vehicle</p>
                <h2>Recently registered vehicles</h2>
                <span>
                  Newly added vehicles appear here, so you can confirm the entry
                  without going back to the dashboard.
                </span>
              </div>
              <div className="add-product-card__count">
                <span>Total records</span>
                <strong>{vehicles.length}</strong>
              </div>
            </div>

            {latestVehicles.length > 0 ? (
              <div className="add-product-vehicle-grid">
                {latestVehicles.map((vehicle) => (
                  <article className="add-product-vehicle-card" key={vehicle.id}>
                    <div className="add-product-vehicle-card__top">
                      <div className="add-product-vehicle-card__icon">
                        {vehicle.model?.charAt(0)?.toUpperCase() || ""}
                      </div>
                      <span className="add-product-vehicle-card__pill">
                        {vehicle.vehicle_type || "Vehicle"}
                      </span>
                    </div>

                    <div className="add-product-vehicle-card__content">
                      <h3>{vehicle.brand} {vehicle.model}</h3>
                      <p>{vehicle.registration_number}</p>
                    </div>

                    <div className="add-product-vehicle-card__meta">
                      <div>
                        <span>Owner</span>
                        <strong>{vehicle.owner_name}</strong>
                      </div>
                      <div>
                        <span>Phone</span>
                        <strong>{vehicle.owner_phone || "Not available"}</strong>
                      </div>
                      <div>
                        <span>Year</span>
                        <strong>{vehicle.manufacture_year || "Not set"}</strong>
                      </div>
                      <div>
                        <span>Added on</span>
                        <strong>{formatDisplayDate(vehicle.created_at)}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="add-product-empty-state">
                <div className="add-product-empty-state__badge">No vehicles yet</div>
                <h3>The first saved vehicle will appear here.</h3>
                <p>
                  Add vehicle details from the form above and this list will update
                  immediately on the same page.
                </p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </section>
  );
}
