import type { ReactNode, ButtonHTMLAttributes } from "react";
import {
  Check,
  ArrowUpRight,
  AlertTriangle,
  PackageX,
  CircleDollarSign,
  CheckCircle2,
} from "lucide-react";
export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "red" | "amber" | "orange";
  dot?: boolean;
}) {
  return (
    <span className={"badge badge-" + tone}>
      {dot && <i />}
      {children}
    </span>
  );
}
export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
}) {
  return (
    <button className={"btn btn-" + variant + " " + className} {...props}>
      {children}
    </button>
  );
}
export function Panel({
  children,
  className = "",
  ...props
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={"panel " + className} {...props}>
      {children}
    </section>
  );
}
export function Eyebrow({
  children,
  icon: Icon,
}: {
  children: ReactNode;
  icon?: typeof Check;
}) {
  return (
    <div className="eyebrow">
      {Icon && <Icon size={14} />}
      <span>{children}</span>
    </div>
  );
}
export function SectionHeading({
  label,
  title,
  detail,
  action,
}: {
  label: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <div className="eyebrow">
          <span>{label}</span>
        </div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  );
}
export function Spark({
  tone = "orange",
  Icon = ArrowUpRight,
}: {
  tone?: "orange" | "red" | "green" | "purple";
  Icon?: typeof ArrowUpRight;
}) {
  return (
    <span className={"spark spark-" + tone}>
      <Icon size={16} />
    </span>
  );
}
export const statTone = (id: string) =>
  id === "orders" || id === "cancellations"
    ? "red"
    : id === "inventory"
      ? "orange"
      : id === "pricing"
        ? "green"
        : "purple";
export const statIcon = (id: string) =>
  id === "orders"
    ? ArrowUpRight
    : id === "cancellations"
      ? AlertTriangle
      : id === "inventory"
        ? PackageX
        : id === "pricing"
          ? CircleDollarSign
          : CheckCircle2;
export function liveText(change: number | null, unit: string) {
  if (change === null) return "Change unavailable";
  if (change === 0) return "No change vs last month";
  return (
    (change > 0 ? "↑" : "↓") +
    " " +
    Math.abs(change).toFixed(unit === "pp" ? 0 : 1) +
    unit +
    " vs last month"
  );
}
