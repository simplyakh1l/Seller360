import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AudioLines,
  LayoutDashboard,
  ListChecks,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
const destinations = [
  { to: "/", label: "Dashboard", short: "Dashboard", Icon: LayoutDashboard },
  { to: "/kam", label: "Get help from Nova", short: "Nova", Icon: AudioLines },
  { to: "/actions", label: "Actions", short: "Actions", Icon: ListChecks },
];
export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const section =
    loc.pathname === "/history"
      ? "/kam"
      : loc.pathname === "/growth"
        ? "/actions"
        : loc.pathname;
  useEffect(() => {
    document
      .querySelector<HTMLHeadingElement>("main h1")
      ?.focus({ preventScroll: true });
    if (!loc.hash) window.scrollTo(0, 0);
    else
      requestAnimationFrame(() =>
        document.getElementById(loc.hash.slice(1))?.scrollIntoView(),
      );
  }, [loc.pathname, loc.hash]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/" aria-label="Seller360 home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <small>Snapdeal</small>
            <b>Seller360</b>
          </span>
        </Link>
        <nav className="side-nav" aria-label="Primary navigation">
          {destinations.map(({ to, label, short, Icon }) => (
            <Link
              key={to}
              to={to}
              className={"nav-link " + (section === to ? "active" : "")}
              aria-current={section === to ? "page" : undefined}
              aria-label={label}
            >
              <Icon size={19} />
              <span className="desktop-nav-label">{label}</span>
              <span className="mobile-nav-label">{short}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Link className="account-link" to="/profile">
            <span className="avatar">S</span>
            <span>
              Seller account<small>Manage workspace</small>
            </span>
            <ArrowUpRight size={15} />
          </Link>
          <Link className="privacy-link" to="/settings">
            <ShieldCheck size={15} />
            Data & privacy
          </Link>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span>Seller workspace</span>
          <div>
            <Link to="/settings">Data & privacy</Link>
            <Link
              to="/profile"
              aria-label="Open seller account"
              className="avatar"
            >
              S
            </Link>
          </div>
        </header>
        <main id="main-content" className="page-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
