import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, User } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { ClientSwitcher } from "@/components/ClientSwitcher";
import { LanguageSwitcher, ThemeToggle } from "@/components/brand/PreferenceControls";
import { useAuth } from "@/hooks/useAuth";
import { useAgency } from "@/hooks/useAgency";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  /** Optional controls rendered at the end of the page header (e.g. a date picker). */
  actions?: ReactNode;
}

const COLLAPSE_KEY = "wob-sidebar-collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export const DashboardLayout = ({ children, title, subtitle, actions }: DashboardLayoutProps) => {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const { isIndividual, isClientUser } = useAgency();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // per-viewer convenience only
      }
      return !c;
    });
  };

  const name = profile?.full_name || t("header.user");

  return (
    <div className="min-h-screen bg-background">
      <div className="print:hidden">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
      </div>

      <div className={cn("print:ms-0 transition-all duration-300", collapsed ? "ms-20" : "ms-64")}>
        <header className="print:hidden sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4 px-8 py-4">
            <div className="flex items-center gap-6 min-w-0">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-foreground truncate">{title}</h1>
                {subtitle && <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
              </div>
              {!isIndividual && !isClientUser && <ClientSwitcher />}
            </div>

            <div className="flex items-center gap-2">
              {actions}
              <LanguageSwitcher />
              <ThemeToggle />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 ps-3 ms-1 border-s border-border">
                    <div className="text-end hidden md:block">
                      <p className="text-sm font-medium text-foreground">{name}</p>
                      <p className="text-xs text-muted-foreground">{profile?.email}</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-pink to-brand-orange flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">{profile?.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>
                    <LogOut className="w-4 h-4 me-2" />
                    {t("header.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="p-8">{children}</main>
      </div>
    </div>
  );
};
