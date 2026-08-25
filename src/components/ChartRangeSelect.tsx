"use client";

import { useEffect, useRef, useState } from "react";
import { CHART_RANGES, type ChartRangeId } from "@/lib/chart-ranges";

export function ChartRangeSelect({
  value,
  onChange,
  disabled,
}: {
  value: ChartRangeId;
  onChange: (id: ChartRangeId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = CHART_RANGES.find((r) => r.id === value) ?? CHART_RANGES[0];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="chart-range" ref={rootRef}>
      <button
        type="button"
        className="chart-range-btn"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current.label}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M6.7 9.3a1 1 0 0 1 1.4 0L12 13.17l3.9-3.88a1 1 0 1 1 1.4 1.42l-4.6 4.58a1 1 0 0 1-1.4 0L6.7 10.7a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>
      {open && (
        <ul className="chart-range-list" role="listbox" aria-label="Período do gráfico">
          {CHART_RANGES.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected={r.id === value}
                className={r.id === value ? "is-selected" : undefined}
                onClick={() => {
                  onChange(r.id);
                  setOpen(false);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
