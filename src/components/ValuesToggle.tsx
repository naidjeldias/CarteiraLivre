"use client";

function EyeOpenIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-1.18M9.88 5.09A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a18.2 18.2 0 0 1-4.12 5.12M6.12 6.12A18.17 18.17 0 0 0 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.11-.79"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ValuesToggle({
  showValues,
  onToggle,
  className = "",
}: {
  showValues: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const label = showValues ? "Ocultar" : "Exibir";
  return (
    <button
      type="button"
      className={`values-toggle${className ? ` ${className}` : ""}`}
      onClick={onToggle}
      aria-pressed={showValues}
      aria-label={showValues ? "Ocultar valores monetários" : "Exibir valores monetários"}
      title={showValues ? "Ocultar valores" : "Exibir valores"}
    >
      <span className="values-toggle-icon">{showValues ? <EyeOpenIcon /> : <EyeOffIcon />}</span>
      <span className="values-toggle-label">{label}</span>
    </button>
  );
}
