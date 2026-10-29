import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AccountType = "individual" | "agency";

/** True when a Postgres error came from the plan-limits trigger (raises with a WOB_LIMIT prefix). */
export function isPlanLimitError(message: string | null | undefined): boolean {
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
  role: "owner" | "admin" | "viewer";
}

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
  refreshClients: () => Promise<void>;
  createClient: (name: string) => Promise<CreateClientResult>;
  updateClient: (clientId: string, name: string) => Promise<boolean>;
  deleteClient: (clientId: string) => Promise<boolean>;
}

const AgencyContext = createContext<AgencyContextType | undefined>(undefined);

export function AgencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [membership, setMembership] = useState<AgencyMember | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  const isOwner = membership?.role === "owner";
  const isAdmin = membership?.role === "admin";
  const canManage = isOwner || isAdmin;
  // Rows created before account types existed are agencies.
  const accountType: AccountType = agency?.account_type === "individual" ? "individual" : "agency";
  const isIndividual = accountType === "individual";

  useEffect(() => {
    if (user) {
      fetchAgencyData();
    } else {
      setAgency(null);
      setMembership(null);
      setClients([]);
      setSelectedClient(null);
      setLoading(false);
    }
  }, [user]);

  const fetchAgencyData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Get user's agency membership. A user could in principle belong to more
      // than one agency (agency_members has no unique constraint on user_id
      // alone) — there's no multi-agency switcher yet, so just pick one
      // deterministically rather than letting maybeSingle() error on >1 row.
      const { data: membershipData, error: membershipError } = await supabase
        .from("agency_members")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (membershipError) {
        console.error("Error fetching membership:", membershipError);
        setLoading(false);
        return;
      }

      if (!membershipData) {
        console.log("No agency membership found");
        setLoading(false);
        return;
      }

      setMembership(membershipData as AgencyMember);

      // Get agency details
      const { data: agencyData, error: agencyError } = await supabase
        .from("agencies")
        .select("*")
        .eq("id", membershipData.agency_id)
        .single();

      if (agencyError) {
        console.error("Error fetching agency:", agencyError);
        setLoading(false);
        return;
      }

      setAgency(agencyData);

      // Get clients
      await fetchClients(membershipData.agency_id);
    } catch (error) {
      console.error("Error fetching agency data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async (agencyId?: string) => {
    const id = agencyId || agency?.id;
    if (!id) return;

    const { data: clientsData, error: clientsError } = await supabase
      .from("clients")
      .select("*")
      .eq("agency_id", id)
      .order("created_at", { ascending: false });

    if (clientsError) {
      console.error("Error fetching clients:", clientsError);
      return;
    }

    setClients(clientsData || []);

    // Auto-select first client if none selected
    if (!selectedClient && clientsData && clientsData.length > 0) {
      setSelectedClient(clientsData[0]);
    }
  };

  const refreshClients = async () => {
    await fetchClients();
  };

  const createClient = async (name: string): Promise<CreateClientResult> => {
    if (!agency || !canManage) return { client: null, limitReached: false };

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
    if (!canManage) return false;

    const { error } = await supabase
      .from("clients")
      .update({ name })
      .eq("id", clientId);

    if (error) {
      console.error("Error updating client:", error);
      return false;
    }

    await refreshClients();
    return true;
  };

  const deleteClient = async (clientId: string): Promise<boolean> => {
    if (!canManage) return false;

    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientId);

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
        refreshClients,
        createClient,
        updateClient,
        deleteClient,
      }}
    >
      {children}
    </AgencyContext.Provider>
  );
}

export function useAgency() {
  const context = useContext(AgencyContext);
  if (context === undefined) {
    throw new Error("useAgency must be used within an AgencyProvider");
  }
  return context;
}
