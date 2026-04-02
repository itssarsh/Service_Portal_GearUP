import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import {
  API_CALL_TYPE,
  GET_SERVICE_RECORDS_API,
  GET_VEHICLES_API,
  PROFILE_API,
  UPDATE_PROFILE_API,
} from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import { showApiError } from "../../utils/apiError";
import {
  getDashboardRoute,
  getLoginRoute,
  getStoredToken,
  getStoredUser,
  storeSession,
} from "../../utils/session";
import { formatDisplayDate } from "../../utils/formatters";
import { normalizePhoneNumber, normalizeWhitespace, toTitleCase } from "../../utils/normalize";
import "./Profile.css";

const VEHICLE_TYPE_OPTIONS = ["Bike", "Scooter", "Car", "SUV", "Van", "Truck"];
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
const ID_PROOF_OPTIONS = ["Aadhaar Card", "Driving Licence", "PAN Card", "Voter ID"];

function toggleSelection(list = [], value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function areStringArraysEqual(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => item === right[index]);
}

function formatListValue(values, fallback = "Not available") {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : fallback;
}

function formatServiceModeLabel(value) {
  const matchedOption = SERVICE_MODE_OPTIONS.find((option) => option.value === value);
  return matchedOption?.label || "Not available";
}

function normalizeTimeFieldValue(value) {
  const normalizedValue = String(value || "").trim();
  return normalizedValue ? normalizedValue.slice(0, 5) : "";
}

function formatAvailabilityWindow(days, start, end) {
  const dayLabel = formatListValue(days, "");
  const normalizedStart = normalizeTimeFieldValue(start);
  const normalizedEnd = normalizeTimeFieldValue(end);

  if (!normalizedStart || !normalizedEnd) {
    return dayLabel || "Not available";
  }

  return [dayLabel, `${normalizedStart} - ${normalizedEnd}`].filter(Boolean).join(" · ");
}

export default function MechanicProfilePage() {
  const [profile, setProfile] = useState(() => getStoredUser());
  const [vehicles, setVehicles] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState({});
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    workshopName: "",
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
  });
  const navigate = useNavigate();
  const toast = useToast();

  const syncProfileForm = (nextProfile) => {
    setProfileForm({
      name: nextProfile?.name || "",
      email: nextProfile?.email || "",
      phone: nextProfile?.phone || "",
      address: nextProfile?.address || "",
      workshopName: nextProfile?.workshop_name || "",
      serviceLocation: nextProfile?.service_location || "",
      vehicleTypes: nextProfile?.vehicle_types || [],
      servicesOffered: nextProfile?.services_offered || [],
      yearsExperience: String(nextProfile?.years_experience ?? ""),
      availabilityDays: nextProfile?.availability_days || [],
      availabilityStart: normalizeTimeFieldValue(nextProfile?.availability_start),
      availabilityEnd: normalizeTimeFieldValue(nextProfile?.availability_end),
      serviceMode: nextProfile?.service_mode || "shop",
      idProofType: nextProfile?.id_proof_type || "",
      idProofReference: nextProfile?.id_proof_reference || "",
    });
  };

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    const handleProfileLoadError = (error) => {
      showApiError(toast, error, "Failed to load profile data.");
    };

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      PROFILE_API(),
      (response) => {
        setProfile(response);
        syncProfileForm(response);
      },
      handleProfileLoadError,
      "",
      null,
      {}
    ).catch(() => undefined);

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_VEHICLES_API(),
      (response) => setVehicles(response),
      handleProfileLoadError,
      "",
      null,
      {}
    ).catch(() => undefined);

    makeApiCall(
      API_CALL_TYPE.GET_CALL,
      GET_SERVICE_RECORDS_API(),
      (response) => setServiceRecords(response),
      handleProfileLoadError,
      "",
      null,
      {}
    ).catch(() => undefined);
  }, [navigate, toast]);

  useEffect(() => {
    if (profile) {
      syncProfileForm(profile);
    }
  }, [profile]);

  const handleProfileFormChange = (field) => (event) => {
    const nextValue = event.target.value;

    setProfileErrors((previousErrors) => {
      if (!previousErrors[field]) {
        return previousErrors;
      }

      return {
        ...previousErrors,
        [field]: "",
      };
    });

    setProfileForm((previousForm) => ({
      ...previousForm,
      [field]: field === "phone" ? normalizePhoneNumber(nextValue, 15) : nextValue,
    }));
  };

  const handleProfileToggle = (field, value) => {
    setProfileErrors((previousErrors) => ({
      ...previousErrors,
      [field]: "",
    }));

    setProfileForm((previousForm) => ({
      ...previousForm,
      [field]: toggleSelection(previousForm[field], value),
    }));
  };

  const handleEditProfileToggle = () => {
    syncProfileForm(profile);
    setProfileErrors({});
    setIsEditingProfile((previousValue) => !previousValue);
  };

  const handleProfileSave = (event) => {
    event.preventDefault();

    const currentProfile = profile || getStoredUser() || {};
    const normalizedCurrentProfile = {
      name: toTitleCase(currentProfile.name || ""),
      email: normalizeWhitespace(currentProfile.email || "").toLowerCase(),
      phone: normalizePhoneNumber(currentProfile.phone || "", 15),
      address: toTitleCase(currentProfile.address || ""),
      workshopName: toTitleCase(currentProfile.workshop_name || ""),
      serviceLocation: normalizeWhitespace(currentProfile.service_location || ""),
      vehicleTypes: currentProfile.vehicle_types || [],
      servicesOffered: currentProfile.services_offered || [],
      yearsExperience: String(currentProfile.years_experience ?? ""),
      availabilityDays: currentProfile.availability_days || [],
      availabilityStart: normalizeTimeFieldValue(currentProfile.availability_start),
      availabilityEnd: normalizeTimeFieldValue(currentProfile.availability_end),
      serviceMode: currentProfile.service_mode || "shop",
      idProofType: normalizeWhitespace(currentProfile.id_proof_type || ""),
      idProofReference: normalizeWhitespace(currentProfile.id_proof_reference || ""),
    };
    const nextName = toTitleCase(profileForm.name);
    const nextEmail = normalizeWhitespace(profileForm.email).toLowerCase();
    const nextPhone = normalizePhoneNumber(profileForm.phone, 15);
    const nextAddress = toTitleCase(profileForm.address);
    const nextWorkshopName = toTitleCase(profileForm.workshopName);
    const nextServiceLocation = normalizeWhitespace(profileForm.serviceLocation);
    const nextVehicleTypes = profileForm.vehicleTypes;
    const nextServicesOffered = profileForm.servicesOffered;
    const nextYearsExperience = String(profileForm.yearsExperience || "");
    const nextAvailabilityDays = profileForm.availabilityDays;
    const nextAvailabilityStart = profileForm.availabilityStart;
    const nextAvailabilityEnd = profileForm.availabilityEnd;
    const nextServiceMode = profileForm.serviceMode;
    const nextIdProofType = normalizeWhitespace(profileForm.idProofType);
    const nextIdProofReference = normalizeWhitespace(profileForm.idProofReference);
    const payload = {};
    const nextErrors = {};

    if (nextName && nextName !== normalizedCurrentProfile.name) {
      payload.name = nextName;
    } else if (!nextName && normalizeWhitespace(profileForm.name || "") !== normalizeWhitespace(currentProfile.name || "")) {
      nextErrors.name = "Name is required.";
    }

    if (nextEmail && nextEmail !== normalizedCurrentProfile.email) {
      if (!/^\S+@\S+\.\S+$/.test(nextEmail)) {
        nextErrors.email = "Please enter a valid email address.";
      } else {
        payload.email = nextEmail;
      }
    } else if (!nextEmail && normalizeWhitespace(profileForm.email || "") !== normalizeWhitespace(currentProfile.email || "")) {
      nextErrors.email = "Email is required.";
    }

    if (nextPhone && nextPhone !== normalizedCurrentProfile.phone) {
      if (nextPhone.length < 10 || nextPhone.length > 15) {
        nextErrors.phone = "Phone number must be between 10 and 15 digits.";
      } else {
        payload.phone = nextPhone;
      }
    } else if (!nextPhone && normalizePhoneNumber(profileForm.phone || "", 15) !== normalizePhoneNumber(currentProfile.phone || "", 15)) {
      nextErrors.phone = "Phone number is required.";
    }

    if (nextAddress && nextAddress !== normalizedCurrentProfile.address) {
      payload.address = nextAddress;
    } else if (!nextAddress && normalizeWhitespace(profileForm.address || "") !== normalizeWhitespace(currentProfile.address || "")) {
      nextErrors.address = "Address is required.";
    }

    if (nextWorkshopName && nextWorkshopName !== normalizedCurrentProfile.workshopName) {
      payload.workshopName = nextWorkshopName;
    } else if (!nextWorkshopName) {
      nextErrors.workshopName = "Workshop name is required.";
    }

    if (nextServiceLocation && nextServiceLocation !== normalizedCurrentProfile.serviceLocation) {
      payload.serviceLocation = nextServiceLocation;
    } else if (!nextServiceLocation) {
      nextErrors.serviceLocation = "Service location is required.";
    }

    if (nextVehicleTypes.length === 0) {
      nextErrors.vehicleTypes = "Select at least one vehicle type.";
    } else if (!areStringArraysEqual(nextVehicleTypes, normalizedCurrentProfile.vehicleTypes)) {
      payload.vehicleTypes = nextVehicleTypes;
    }

    if (nextServicesOffered.length === 0) {
      nextErrors.servicesOffered = "Select at least one service.";
    } else if (!areStringArraysEqual(nextServicesOffered, normalizedCurrentProfile.servicesOffered)) {
      payload.servicesOffered = nextServicesOffered;
    }

    if (!/^\d+$/.test(nextYearsExperience) || Number(nextYearsExperience) < 0 || Number(nextYearsExperience) > 60) {
      nextErrors.yearsExperience = "Years of experience must be between 0 and 60.";
    } else if (nextYearsExperience !== normalizedCurrentProfile.yearsExperience) {
      payload.yearsExperience = Number(nextYearsExperience);
    }

    if (nextAvailabilityDays.length === 0) {
      nextErrors.availabilityDays = "Select at least one working day.";
    } else if (!areStringArraysEqual(nextAvailabilityDays, normalizedCurrentProfile.availabilityDays)) {
      payload.availabilityDays = nextAvailabilityDays;
    }

    if (!nextAvailabilityStart || !nextAvailabilityEnd) {
      nextErrors.availabilityStart = "Working hours are required.";
    } else if (
      nextAvailabilityStart !== normalizedCurrentProfile.availabilityStart ||
      nextAvailabilityEnd !== normalizedCurrentProfile.availabilityEnd
    ) {
      payload.availabilityStart = nextAvailabilityStart;
      payload.availabilityEnd = nextAvailabilityEnd;
    }

    if (!nextServiceMode) {
      nextErrors.serviceMode = "Service mode is required.";
    } else if (nextServiceMode !== normalizedCurrentProfile.serviceMode) {
      payload.serviceMode = nextServiceMode;
    }

    if (!nextIdProofType) {
      nextErrors.idProofType = "ID proof type is required.";
    } else if (nextIdProofType !== normalizedCurrentProfile.idProofType) {
      payload.idProofType = nextIdProofType;
    }

    if (!nextIdProofReference) {
      nextErrors.idProofReference = "ID proof reference is required.";
    } else if (nextIdProofReference !== normalizedCurrentProfile.idProofReference) {
      payload.idProofReference = nextIdProofReference;
    }

    setProfileErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      toast.error("Please fix the highlighted profile fields.");
      return;
    }

    if (Object.keys(payload).length === 0) {
      toast.error("No profile changes to save.");
      return;
    }

    setIsSavingProfile(true);

    makeApiCall(
      API_CALL_TYPE.PUT_CALL,
      UPDATE_PROFILE_API(),
      (response) => {
        setProfile((previousProfile) => ({
          ...previousProfile,
          ...response,
        }));

        const token = getStoredToken();

        if (token) {
          storeSession(token, {
            ...getStoredUser(),
            ...response,
          });
        }

        syncProfileForm(response);
        setProfileErrors({});
        setIsEditingProfile(false);
        setIsSavingProfile(false);
        toast.success("Profile updated successfully.");
      },
      (error) => {
        setIsSavingProfile(false);
        showApiError(toast, error, "Failed to update profile.");
      },
      "",
      null,
      payload
    ).catch(() => undefined);
  };

  const profileStats = [
    {
      label: "Vehicles",
      value: String(profile?.stats?.vehicles_count ?? vehicles.length ?? 0),
    },
    {
      label: "Service records",
      value: String(profile?.stats?.service_records_count ?? serviceRecords.length ?? 0),
    },
    {
      label: "Role",
      value: profile?.role || "mechanic",
    },
  ];
  // const profileHighlights = [
  //   {
  //     label: "Joined",
  //     value: formatDisplayDate(profile?.created_at, "Not available"),
  //   },
  //   {
  //     label: "Phone verification",
  //     value: profile?.phone_verified ? "Verified" : "Pending verification",
  //   },
  //   {
  //     label: "Service mode",
  //     value: formatServiceModeLabel(profile?.service_mode),
  //   },
  // ];

  return (
    <section className="profile-page">
      <div className="profile-page__backdrop"></div>

      <div className="profile-container">
        <header className="profile-hero">
          <div className="profile-hero__content">
            <p className="profile-hero__eyebrow">Workshop profile</p>
            <h1>Operator profile</h1>
            <p className="profile-hero__description">
              Manage your account identity, contact details, and workshop access from one clean profile workspace.
            </p>

            <div className="profile-hero__actions">
              <Link className="profile-hero__button" to={getDashboardRoute()}>
                Back to dashboard
              </Link>
              <button
                className="profile-hero__secondary"
                type="button"
                onClick={handleEditProfileToggle}
              >
                {isEditingProfile ? "Close editor" : "Edit profile"}
              </button>
            </div>
          </div>

          <aside className="profile-summary">
            <div className="profile-summary__top">
              <div className="profile-summary__avatar">
                {profile?.name?.charAt(0)?.toUpperCase() || "M"}
              </div>
              <div className="profile-summary__identity">
                <h2>{profile?.name || "Workshop operator"}</h2>
                <span>{profile?.role || "mechanic"}</span>
              </div>
            </div>
            <p className="profile-summary__bio">Workshop account for daily operations and service coordination.</p>
            <div className="profile-summary__meta">
              <div className="profile-summary__meta-item">
                <span>Workshop</span>
                <strong>{profile?.workshop_name || "Not available"}</strong>
              </div>
              <div className="profile-summary__meta-item">
                <span>Service mode</span>
                <strong>{formatServiceModeLabel(profile?.service_mode)}</strong>
              </div>
              <div className="profile-summary__meta-item">
                <span>Email</span>
                <strong>{profile?.email || "Not available"}</strong>
              </div>
              <div className="profile-summary__meta-item">
                <span>Phone</span>
                <strong>{profile?.phone || "Not available"}</strong>
              </div>
            </div>
            <div className="profile-summary__status">
              <span>Status</span>
              <strong>Active</strong>
            </div>
          </aside>
        </header>

        <section className="profile-grid">
          <article className="profile-card">
            <div className="profile-card__header">
              <p className="profile-card__eyebrow">Profile overview</p>
              <h3>Account details</h3>
              <span>
                {isEditingProfile
                  ? "Update your core account details and save changes instantly."
                  : "Your current workshop account information is shown here."}
              </span>
            </div>

            {isEditingProfile ? (
              <form className="profile-edit-form" onSubmit={handleProfileSave}>
                <div className="profile-edit-grid">
                  <label className="profile-edit-field">
                    <span>Full name</span>
                    <input
                      className={profileErrors.name ? "profile-edit-input--error" : ""}
                      name="name"
                      type="text"
                      value={profileForm.name}
                      disabled={isSavingProfile}
                      onChange={handleProfileFormChange("name")}
                      autoComplete="name"
                    />
                    {profileErrors.name ? <small className="profile-edit-field__error">{profileErrors.name}</small> : null}
                  </label>

                  <label className="profile-edit-field">
                    <span>Email address</span>
                    <input
                      className={profileErrors.email ? "profile-edit-input--error" : ""}
                      name="email"
                      type="email"
                      value={profileForm.email}
                      disabled={isSavingProfile}
                      onChange={handleProfileFormChange("email")}
                      autoComplete="email"
                    />
                    {profileErrors.email ? <small className="profile-edit-field__error">{profileErrors.email}</small> : null}
                  </label>

                  <label className="profile-edit-field">
                    <span>Phone number</span>
                    <input
                      className={profileErrors.phone ? "profile-edit-input--error" : ""}
                      name="phone"
                      type="text"
                      inputMode="numeric"
                      value={profileForm.phone}
                      disabled={isSavingProfile}
                      onChange={handleProfileFormChange("phone")}
                      autoComplete="tel"
                    />
                    {profileErrors.phone ? <small className="profile-edit-field__error">{profileErrors.phone}</small> : null}
                  </label>

                  <label className="profile-edit-field">
                    <span>Workshop name</span>
                    <input
                      className={profileErrors.workshopName ? "profile-edit-input--error" : ""}
                      name="workshopName"
                      type="text"
                      value={profileForm.workshopName}
                      disabled={isSavingProfile}
                      onChange={handleProfileFormChange("workshopName")}
                    />
                    {profileErrors.workshopName ? <small className="profile-edit-field__error">{profileErrors.workshopName}</small> : null}
                  </label>

                  <label className="profile-edit-field">
                    <span>Service location</span>
                    <input
                      className={profileErrors.serviceLocation ? "profile-edit-input--error" : ""}
                      name="serviceLocation"
                      type="text"
                      value={profileForm.serviceLocation}
                      disabled={isSavingProfile}
                      onChange={handleProfileFormChange("serviceLocation")}
                    />
                    {profileErrors.serviceLocation ? <small className="profile-edit-field__error">{profileErrors.serviceLocation}</small> : null}
                  </label>

                  <label className="profile-edit-field">
                    <span>Years of experience</span>
                    <input
                      className={profileErrors.yearsExperience ? "profile-edit-input--error" : ""}
                      name="yearsExperience"
                      type="number"
                      min="0"
                      max="60"
                      value={profileForm.yearsExperience}
                      disabled={isSavingProfile}
                      onChange={handleProfileFormChange("yearsExperience")}
                    />
                    {profileErrors.yearsExperience ? <small className="profile-edit-field__error">{profileErrors.yearsExperience}</small> : null}
                  </label>

                  <label className="profile-edit-field">
                    <span>Service mode</span>
                    <select
                      className={profileErrors.serviceMode ? "profile-edit-input--error" : ""}
                      name="serviceMode"
                      value={profileForm.serviceMode}
                      disabled={isSavingProfile}
                      onChange={handleProfileFormChange("serviceMode")}
                    >
                      {SERVICE_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {profileErrors.serviceMode ? <small className="profile-edit-field__error">{profileErrors.serviceMode}</small> : null}
                  </label>

                  <label className="profile-edit-field profile-edit-field--full">
                    <span>Address</span>
                    <textarea
                      className={profileErrors.address ? "profile-edit-input--error" : ""}
                      name="address"
                      value={profileForm.address}
                      disabled={isSavingProfile}
                      onChange={handleProfileFormChange("address")}
                      autoComplete="street-address"
                    />
                    {profileErrors.address ? <small className="profile-edit-field__error">{profileErrors.address}</small> : null}
                  </label>

                  <div className="profile-edit-field profile-edit-field--full">
                    <span>Vehicle types</span>
                    <div className="profile-edit-choice-group">
                      {VEHICLE_TYPE_OPTIONS.map((option) => (
                        <button
                          className={`profile-edit-choice${
                            profileForm.vehicleTypes.includes(option) ? " profile-edit-choice--active" : ""
                          }`}
                          key={option}
                          type="button"
                          disabled={isSavingProfile}
                          onClick={() => handleProfileToggle("vehicleTypes", option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    {profileErrors.vehicleTypes ? <small className="profile-edit-field__error">{profileErrors.vehicleTypes}</small> : null}
                  </div>

                  <div className="profile-edit-field profile-edit-field--full">
                    <span>Services offered</span>
                    <div className="profile-edit-choice-group">
                      {SERVICE_OFFERING_OPTIONS.map((option) => (
                        <button
                          className={`profile-edit-choice${
                            profileForm.servicesOffered.includes(option) ? " profile-edit-choice--active" : ""
                          }`}
                          key={option}
                          type="button"
                          disabled={isSavingProfile}
                          onClick={() => handleProfileToggle("servicesOffered", option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    {profileErrors.servicesOffered ? <small className="profile-edit-field__error">{profileErrors.servicesOffered}</small> : null}
                  </div>

                  <div className="profile-edit-field profile-edit-field--full">
                    <span>Working days</span>
                    <div className="profile-edit-choice-group">
                      {WORKING_DAY_OPTIONS.map((day) => (
                        <button
                          className={`profile-edit-choice${
                            profileForm.availabilityDays.includes(day) ? " profile-edit-choice--active" : ""
                          }`}
                          key={day}
                          type="button"
                          disabled={isSavingProfile}
                          onClick={() => handleProfileToggle("availabilityDays", day)}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                    {profileErrors.availabilityDays ? <small className="profile-edit-field__error">{profileErrors.availabilityDays}</small> : null}
                  </div>

                  <label className="profile-edit-field">
                    <span>Working hours from</span>
                    <input
                      className={profileErrors.availabilityStart ? "profile-edit-input--error" : ""}
                      name="availabilityStart"
                      type="time"
                      value={profileForm.availabilityStart}
                      disabled={isSavingProfile}
                      onChange={handleProfileFormChange("availabilityStart")}
                    />
                    {profileErrors.availabilityStart ? <small className="profile-edit-field__error">{profileErrors.availabilityStart}</small> : null}
                  </label>

                  <label className="profile-edit-field">
                    <span>Working hours until</span>
                    <input
                      className={profileErrors.availabilityStart ? "profile-edit-input--error" : ""}
                      name="availabilityEnd"
                      type="time"
                      value={profileForm.availabilityEnd}
                      disabled={isSavingProfile}
                      onChange={handleProfileFormChange("availabilityEnd")}
                    />
                  </label>

                  <label className="profile-edit-field">
                    <span>ID proof type</span>
                    <select
                      className={profileErrors.idProofType ? "profile-edit-input--error" : ""}
                      name="idProofType"
                      value={profileForm.idProofType}
                      disabled={isSavingProfile}
                      onChange={handleProfileFormChange("idProofType")}
                    >
                      <option value="">Select ID proof</option>
                      {ID_PROOF_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {profileErrors.idProofType ? <small className="profile-edit-field__error">{profileErrors.idProofType}</small> : null}
                  </label>

                  <label className="profile-edit-field">
                    <span>ID proof reference</span>
                    <input
                      className={profileErrors.idProofReference ? "profile-edit-input--error" : ""}
                      name="idProofReference"
                      type="text"
                      value={profileForm.idProofReference}
                      disabled={isSavingProfile}
                      onChange={handleProfileFormChange("idProofReference")}
                    />
                    {profileErrors.idProofReference ? <small className="profile-edit-field__error">{profileErrors.idProofReference}</small> : null}
                  </label>
                </div>

                <div className="profile-edit-actions">
                  <button className="profile-edit-button" type="submit" disabled={isSavingProfile}>
                    {isSavingProfile ? "Saving..." : "Save changes"}
                  </button>
                  <button
                    className="profile-edit-button profile-edit-button--secondary"
                    type="button"
                    disabled={isSavingProfile}
                    onClick={handleEditProfileToggle}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="profile-details">
                {[
                  { label: "Full name", value: profile?.name || "Workshop operator" },
                  { label: "Workshop name", value: profile?.workshop_name || "Not available" },
                  { label: "Email address", value: profile?.email || "Not available" },
                  { label: "Phone number", value: profile?.phone || "Not available" },
                  { label: "Role", value: profile?.role || "mechanic" },
                  { label: "Service location", value: profile?.service_location || "Not available" },
                  { label: "Vehicle types", value: formatListValue(profile?.vehicle_types) },
                  { label: "Services offered", value: formatListValue(profile?.services_offered) },
                  { label: "Years of experience", value: profile?.years_experience ?? "Not available" },
                  { label: "Availability", value: formatAvailabilityWindow(profile?.availability_days, profile?.availability_start, profile?.availability_end) },
                  { label: "Service mode", value: formatServiceModeLabel(profile?.service_mode) },
                  { label: "ID proof", value: profile?.id_proof_type || "Not available" },
                  { label: "ID reference", value: profile?.id_proof_reference || "Not available" },
                  { label: "Phone verification", value: profile?.phone_verified ? "Verified" : "Pending verification" },
                  { label: "Address", value: profile?.address || "Not available" },
                  { label: "Joined on", value: formatDisplayDate(profile?.created_at, "Not available") },
                ].map((item) => (
                  <div className="profile-detail" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            )}
          </article>

          <div className="profile-side">
            <article className="profile-card profile-card--dark">
              <div className="profile-card__header">
                <p className="profile-card__eyebrow profile-card__eyebrow--dark">
                  Performance snapshot
                </p>
                <h3>Quick stats</h3>
              </div>

              <div className="profile-stats">
                {profileStats.map((stat) => (
                  <div className="profile-stat" key={stat.label}>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>
            </article>
{/* 
            <article className="profile-card">
              <div className="profile-card__header">
                <p className="profile-card__eyebrow">Access summary</p>
                <h3>Profile readiness</h3>
              </div>

              <div className="profile-note-list">
                {profileHighlights.map((item) => (
                  <div className="profile-note-item" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </article> */}
          </div>
        </section>
      </div>
    </section>
  );
}
