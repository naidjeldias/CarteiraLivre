"use client";

import { useEffect, useRef, useState } from "react";
import type { GeminiModelOption } from "@/lib/agent/models";

export function ModelPicker({
  models,
  value,
  onChange,
  disabled,
}: {
  models: GeminiModelOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = models.find((m) => m.id === value) ?? models[0];

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
    <div className="assistant-model" ref={rootRef}>
      <button
        type="button"
        className="assistant-model-btn"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Modelo Gemini"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current?.label ?? "Modelo"}</span>
      </button>
      {open && (
        <ul className="assistant-model-list" role="listbox" aria-label="Modelo Gemini">
          {models.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={m.id === value}
                className={m.id === value ? "is-selected" : undefined}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                <span>{m.label}</span>
                {m.hint && <span className="assistant-model-hint">{m.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
