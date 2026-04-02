import { useState } from "react";

function getEyeMotion(value) {
  const text = String(value || "");
  const lastCharacterCode = text ? text.charCodeAt(text.length - 1) : 0;
  const horizontalShift = ((text.length % 5) - 2) * 0.42 + ((lastCharacterCode % 4) - 1.5) * 0.18;
  const verticalShift =
    ((Math.floor(text.length / 2) % 3) - 1) * 0.18 + ((lastCharacterCode % 3) - 1) * 0.08;

  return {
    x: Number(horizontalShift.toFixed(2)),
    y: Number(verticalShift.toFixed(2)),
  };
}

export default function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  disabled = false,
  autoComplete,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const eyeMotion = getEyeMotion(value);

  return (
    <div className="password-input">
      <input
        className="password-input__field"
        id={id}
        placeholder={placeholder}
        type={isVisible ? "text" : "password"}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={onChange}
      />
      <button
        className={`password-input__toggle ${isVisible ? "password-input__toggle--open" : ""}`}
        type="button"
        aria-label={isVisible ? "Hide password" : "Show password"}
        aria-pressed={isVisible}
        disabled={disabled}
        onClick={() => setIsVisible((visible) => !visible)}
      >
        <span
          className={`password-eye-icon ${isVisible ? "password-eye-icon--open" : "password-eye-icon--closed"}`}
          style={{
            "--eye-shift-x": `${eyeMotion.x}px`,
            "--eye-shift-y": `${eyeMotion.y}px`,
          }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" focusable="false">
            <path
              className="password-eye-icon__outline"
              d="M2.2 12c1.8-4 5.5-6.4 9.8-6.4S20 8 21.8 12c-1.8 4-5.5 6.4-9.8 6.4S4 16 2.2 12Z"
            />
            <path
              className="password-eye-icon__closed-top"
              d="M4.4 12.1C6.2 10.4 8.8 9.4 12 9.4s5.8 1 7.6 2.7"
            />
            <path
              className="password-eye-icon__closed-bottom"
              d="M4.4 12.1C6.2 13.8 8.8 14.8 12 14.8s5.8-1 7.6-2.7"
            />
            <circle className="password-eye-icon__iris" cx="12" cy="12" r="4.2" />
            <circle className="password-eye-icon__pupil" cx="12" cy="12" r="2.05" />
            <circle className="password-eye-icon__glint" cx="10.85" cy="10.85" r="0.82" />
            <path className="password-eye-icon__slash" d="M4.8 18.2 19.2 5.8" />
          </svg>
        </span>
      </button>
    </div>
  );
}
