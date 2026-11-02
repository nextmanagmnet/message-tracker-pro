// Shared by every tiktok-oauth action.
export interface TikTokContext {
  req: Request;
  // JSON body when the action came in the body (preferred); null when it came as ?action= (legacy)
  parsedBody: { action?: string; clientId?: unknown; testEventCode?: unknown } | null;
  supabaseUrl: string;
  supabaseServiceKey: string;
  tiktokAppId: string;
  tiktokAppSecret: string;
}
