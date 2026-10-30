import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  MessageCircle,
  TrendingUp,
  Plug,
  Bot,
  Settings,
  ChevronLeft,
  ChevronRight,
  Users,
  Building2,
  FileText,
  Package,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useAgency } from "@/hooks/useAgency";
import { cn } from "@/lib/utils";

const mainItems = [
  { icon: LayoutDashboard, key: "nav.dashboard", path: "/" },
  { icon: MessageCircle, key: "nav.leads", path: "/leads" },
  { icon: TrendingUp, key: "nav.campaigns", path: "/campaigns" },
  { icon: Plug, key: "nav.connections", path: "/connections" },
  { icon: Bot, key: "nav.aiAgent", path: "/ai-agent" },
  { icon: Package, key: "nav.catalog", path: "/catalog" },
  { icon: FileText, key: "nav.reports", path: "/reports" },
  { icon: Settings, key: "nav.settings", path: "/settings" },
];

const agencyItems = [
  { icon: Building2, key: "nav.allClients", path: "/agency" },
  { icon: Users, key: "nav.clients", path: "/clients" },
  { icon: Wallet, key: "nav.funding", path: "/funding" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar = ({ collapsed, onToggle }: SidebarProps) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { isIndividual, isClientUser } = useAgency();
  const rtl = i18n.dir() === "rtl";

  const renderItem = (item: (typeof mainItems)[number]) => {
    const isActive =
      item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
    const label = t(item.key);
    return (
      <Link
        key={item.path}
        to={item.path}
        className={cn("sidebar-link", isActive && "active", collapsed && "justify-center px-0")}
        title={collapsed ? label : undefined}
      >
        <item.icon className="w-5 h-5 shrink-0" />
        {!collapsed && <span className="fade-in truncate">{label}</span>}
      </Link>
    );
  };

  // Chevron points toward the side the sidebar collapses to, mirrored in RTL.
  const CollapseIcon = collapsed !== rtl ? ChevronRight : ChevronLeft;

  return (
    <aside
      className={cn(
        "fixed start-0 top-0 h-screen bg-sidebar border-e border-sidebar-border transition-all duration-300 z-50",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className="flex flex-col h-full">
        <div className={cn("flex items-center border-b border-sidebar-border h-20", collapsed ? "justify-center px-3" : "px-5")}>
          <Link to="/" aria-label="WOB">
            {collapsed ? <Logo variant="mark" className="h-9" /> : <Logo variant="horizontal" className="h-11" />}
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1">
          {mainItems.filter((i) => !(isClientUser && i.path === "/ai-agent")).map(renderItem)}

          {!isIndividual && !isClientUser && (
            <div className="pt-6">
              {!collapsed && (
                <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {t("nav.agencySection")}
                </p>
              )}
              <div className="space-y-1">{agencyItems.map(renderItem)}</div>
            </div>
          )}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border">
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-sidebar-accent transition-colors"
            aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          >
            <CollapseIcon className="w-4 h-4" />
            {!collapsed && <span>{t("nav.collapse")}</span>}
          </button>
        </div>
      </div>
    </aside>
  );
};
