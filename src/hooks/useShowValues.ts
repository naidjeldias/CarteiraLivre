"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  loadShowValues,
  saveShowValues,
  subscribeShowValues,
} from "@/lib/ui-preferences";

function getServerShowValuesSnapshot(): boolean {
  return false;
}

export function useShowValues() {
  const showValues = useSyncExternalStore(
    subscribeShowValues,
    loadShowValues,
    getServerShowValuesSnapshot
  );

  const toggleShowValues = useCallback(() => {
    saveShowValues(!loadShowValues());
  }, []);

  return { showValues, toggleShowValues };
}
