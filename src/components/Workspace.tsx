import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "./UI";
export const fmtCurrency = (n: number) => "₹" + n.toLocaleString("en-IN");
export const fmtPct = (n: number) => n + "%";
export const shortDate = (d: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
export function PageHeading({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="page-kicker">{eyebrow}</p>}
        <h1 tabIndex={-1}>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="heading-action">{action}</div>}
    </header>
  );
}
export function Notice({
  children,
  onRetry,
}: {
  children: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="error-banner">
      <AlertCircle size={19} />
      <span>{children}</span>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
  );
}
