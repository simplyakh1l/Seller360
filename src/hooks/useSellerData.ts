import { useCallback, useEffect, useRef, useState } from "react";
import type { PerformanceResponse } from "../../shared/types";
import { api } from "../lib/api";
export function useSellerData() {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++version.current;
    setLoading(true);
    setError("");
    try {
      const result = await api.performance();
      if (alive.current && id === version.current) setData(result);
    } catch (e) {
      if (alive.current && id === version.current)
        setError(
          e instanceof Error ? e.message : "Could not load account figures.",
        );
    } finally {
      if (alive.current && id === version.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      ++version.current;
    };
  }, [refresh]);
  return { data, loading, error, refresh };
}
