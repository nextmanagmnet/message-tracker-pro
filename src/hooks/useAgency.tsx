import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";

export type AccountType = "individual" | "agency";

/** What an admin can be limited to. Owners always have all of them. Mirrors has_agency_permission in the database. */
export const PERMISSIONS = ["clients", "funding", "ad_accounts"] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** True when a Postgres error came from the plan-limits trigger (raises with a WOB_LIMIT prefix). */
function isPlanLimitError(message: string | null | undefined): boolean {
  return !!message && message.includes("WOB_LIMIT");
}

export type CreateClientResult = { client: Client | null; limitReached: boolean };

interface Agency {
  id: string;
  name: string;
  account_type?: AccountType | null;
}

interface AgencyMember {
  id: string;
  user_id: string;
  agency_id: string;
  role: "owner" | "admin" | "viewer" | "client";
  client_id?: string | null;
  /** Admins only. null = every permission (admins from before permissions existed). */
  permissions?: string[] | null;
}

/** A user who linked their ad account to this agency. The agency sees campaign numbers only. */
export type LinkedAccount = Database["public"]["Functions"]["agency_client_metrics"]["Returns"][number];

export interface Client {
  id: string;
  agency_id: string;
  name: string;
  created_at: string;
}

interface AgencyContextType {
  agency: Agency | null;
  membership: AgencyMember | null;
  clients: Client[];
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
  loading: boolean;
  accountType: AccountType;
  isIndividual: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  canManage: boolean;
  /** Owners, or admins holding this permission. Hides the control; the server checks it again. */
  can: (permission: Permission) => boolean;
  /** A login that belongs to one client (invited by the agency), not agency staff. */
  isClientUser: boolean;
  /** Staff with edit rights, or the client user for their own client. */
  canManageClient: boolean;
  refreshClients: () => Promise<void>;
  /** Users linked through an invite (last 7 days of campaign numbers). Empty for individuals and client logins. */
  linkedAccounts: LinkedAccount[];
  linkedLoading: boolean;
  refreshLinked: () => Promise<void>;
  createClient: (name: string) => Promise<CreateClientResult>;
  updateClient: (clientId: string, name: string) => Promise<boolean>;
  deleteClient: (clientId: string) => Promise<boolean>;
}

const AgencyContext = createContext<AgencyContextType | undefined>(undefined);

async function loadClients(agencyId: string): Promise<Client[] | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching clients:", error);
    return null;
  }
  return data || [];
}

export function AgencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [membership, setMembership] = useState<AgencyMember | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [linkedLoading, setLinkedLoading] = useState(false);

  const isOwner = membership?.role === "owner";
  const isAdmin = membership?.role === "admin";
  const canManage = isOwner || isAdmin;
  const can = (permission: Permission) =>
    isOwner || (isAdmin && (membership?.permissions == null || membership.permissions.includes(permission)));
  const isClientUser = membership?.role === "client";
  const canManageClient = canManage || isClientUser;
  // Rows created before account types existed are agencies.
  const accountType: AccountType = agency?.account_type === "individual" ? "individual" : "agency";
  const isIndividual = accountType === "individual";

  const userId = user?.id ?? null;
  const agencyId = agency?.id ?? null;
  const hasLinks = !!agencyId && !isIndividual && !isClientUser;

  const refreshLinked = useCallback(async () => {
    if (!agencyId || !hasLinks) return;
    const { data, error } = await supabase.rpc("agency_client_metrics", { p_agency: agencyId });
    if (error) {
      console.error("Error fetching linked accounts:", error);
      return;
    }
    setLinkedAccounts([...(data ?? [])].sort((a, b) => Number(b.spend) - Number(a.spend)));
  }, [agencyId, hasLinks]);

  // Load once per agency; screens call refreshLinked again when they open so a freshly accepted invite shows up.
  useEffect(() => {
    if (!hasLinks) {
      setLinkedAccounts([]);
      return;
    }
    setLinkedLoading(true);
    void refreshLinked().finally(() => setLinkedLoading(false));
  }, [hasLinks, refreshLinked]);

  // Refetch whenever the signed-in user changes. `cancelled` makes a response that arrives after
  // the user changed (or the provider unmounted) a no-op, so one user's data never lands under another.
  useEffect(() => {
    if (!userId) {
      setAgency(null);
      setMembership(null);
      setClients([]);
      setSelectedClient(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        // A user could in principle belong to more than one agency (no unique constraint on
        // user_id alone) and there's no switcher yet, so pick one deterministically.
        const fetchMembership = () =>
          supabase
            .from("agency_members")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        let { data: membershipData, error: membershipError } = await fetchMembership();
        if (cancelled) return;

        if (membershipError) {
          console.error("Error fetching membership:", membershipError);
          return;
        }

        if (!membershipData) {
          // A client the agency invited has no membership until their invite is accepted.
          const { data: acceptedClient } = await supabase.rpc("accept_client_invite");
          if (cancelled) return;
          const { data: acceptedTeam } = acceptedClient ? { data: null } : await supabase.rpc("accept_team_invite");
          if (cancelled) return;
          if (acceptedClient || acceptedTeam) {
            ({ data: membershipData, error: membershipError } = await fetchMembership());
            if (cancelled) return;
            if (membershipError) {
              console.error("Error fetching membership:", membershipError);
              return;
            }
          }
          if (!membershipData) {
            console.log("No agency membership found");
            return;
          }
        }

        setMembership(membershipData as AgencyMember);

        const { data: agencyData, error: agencyError } = await supabase
          .from("agencies")
          .select("*")
          .eq("id", membershipData.agency_id)
          .single();
        if (cancelled) return;

        if (agencyError) {
          console.error("Error fetching agency:", agencyError);
          return;
        }

        setAgency(agencyData);

        const loaded = await loadClients(membershipData.agency_id);
        if (cancelled || !loaded) return;
        setClients(loaded);
        setSelectedClient((prev) => prev ?? loaded[0] ?? null);
      } catch (error) {
        console.error("Error fetching agency data:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshClients = async () => {
    if (!agency) return;
    const loaded = await loadClients(agency.id);
    if (!loaded) return;
    setClients(loaded);
    // Auto-select first client if none selected
    setSelectedClient((prev) => prev ?? loaded[0] ?? null);
  };

  const createClient = async (name: string): Promise<CreateClientResult> => {
    if (!agency || !can("clients")) return { client: null, limitReached: false };

    const { data, error } = await supabase
      .from("clients")
      .insert({
        agency_id: agency.id,
        name,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating client:", error);
      return { client: null, limitReached: isPlanLimitError(error.message) };
    }

    await refreshClients();
    return { client: data, limitReached: false };
  };

  const updateClient = async (clientId: string, name: string): Promise<boolean> => {
    if (!can("clients")) return false;

    const { error } = await supabase.from("clients").update({ name }).eq("id", clientId);

    if (error) {
      console.error("Error updating client:", error);
      return false;
    }

    await refreshClients();
    return true;
  };

  const deleteClient = async (clientId: string): Promise<boolean> => {
    if (!can("clients")) return false;

    const { error } = await supabase.from("clients").delete().eq("id", clientId);

    if (error) {
      console.error("Error deleting client:", error);
      return false;
    }

    // Clear selection if deleted client was selected
    if (selectedClient?.id === clientId) {
      setSelectedClient(null);
    }

    await refreshClients();
    return true;
  };

  return (
    <AgencyContext.Provider
      value={{
        agency,
        membership,
        clients,
        selectedClient,
        setSelectedClient,
        loading,
        accountType,
        isIndividual,
        isOwner,
        isAdmin,
        canManage,
        can,
        isClientUser,
        canManageClient,
        refreshClients,
        linkedAccounts,
        linkedLoading,
        refreshLinked,
        createClient,
        updateClient,
        deleteClient,
      }}
    >
      {children}
    </AgencyContext.Provider>
  );
}

// The provider and its hook share the private context; splitting them would just export the context instead.
// eslint-disable-next-line react-refresh/only-export-components
export function useAgency() {
  const context = useContext(AgencyContext);
  if (context === undefined) {
    throw new Error("useAgency must be used within an AgencyProvider");
  }
  return context;
}
