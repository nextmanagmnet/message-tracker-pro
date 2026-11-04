export type LinkStatus = "not_invited" | "invited" | "joined" | "revoked";

export type LinkAccount = {
  advertiserId: string;
  name: string;
  bcId: string;
  bcName: string | null;
  status: LinkStatus;
  inviteId?: string;
  invitedAt?: string;
  expiresAt?: string;
  linkId?: string;
  linkedAt?: string;
};

export type ListResult = {
  needsRefresh: boolean;
  accounts: LinkAccount[];
  counts: { total: number; notInvited: number; invited: number; joined: number };
};

export type InviteLink = { advertiserId: string; name: string; url: string };

export const MAX_BATCH = 50;
export const PAGE_SIZE = 50;
