import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { X } from "lucide-react";
import type { ActionItem, Health } from "../shared/types";
import { api } from "./lib/api";
import { AppShell } from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Nova from "./pages/Nova";
import Actions from "./pages/Actions";
import History from "./pages/History";
import { Profile, DataPrivacy } from "./pages/Account";
export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState("");
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [actionsError, setActionsError] = useState("");
  const [actionsLoading, setActionsLoading] = useState(true);
  const [toast, setToast] = useState("");
  const refreshHealth = useCallback(async () => {
    setHealthError("");
    try {
      setHealth(await api.health());
    } catch {
      setHealthError("Could not check Nova’s availability.");
    }
  }, []);
  const refreshActions = useCallback(async () => {
    setActionsLoading(true);
    setActionsError("");
    try {
      setActions((await api.actions()).actions);
    } catch (e) {
      setActionsError(e instanceof Error ? e.message : "Could not load tasks.");
    } finally {
      setActionsLoading(false);
    }
  }, []);
  useEffect(() => {
    void refreshHealth();
    void refreshActions();
  }, [refreshHealth, refreshActions]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = useCallback((s: string) => setToast(s), []);
  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/analytics"
            element={<Navigate to="/#performance" replace />}
          />
          <Route
            path="/kam"
            element={<Nova notify={notify} onActions={setActions} />}
          />
          <Route
            path="/actions"
            element={
              <Actions
                actions={actions}
                setActions={setActions}
                notify={notify}
                loading={actionsLoading}
                error={actionsError}
                onRefresh={refreshActions}
              />
            }
          />
          <Route
            path="/growth"
            element={<Navigate to="/actions?view=suggestions" replace />}
          />
          <Route path="/history" element={<History />} />
          <Route path="/profile" element={<Profile />} />
          <Route
            path="/settings"
            element={
              <DataPrivacy
                health={health}
                error={healthError}
                refresh={refreshHealth}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      {toast && (
        <div role="status" className="toast">
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
}
