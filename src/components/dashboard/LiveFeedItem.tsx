import { MessageCircle, CheckCircle, AlertTriangle, XCircle, Link2, Repeat, Timer } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface LiveFeedItemProps {
  phoneNumber: string;
  message: string;
  timestamp: string;
  status: "verified" | "pending" | "trash";
  campaign?: string;
  qualityScore?: number;
  attributionSource?: string;
  signals?: Record<string, unknown> | null;
  isRepeat?: boolean;
  clickToMessageSeconds?: number | null;
}

const ATTRIBUTION_LABELS: Record<string, string> = {
  referral: "TikTok/Meta ad click",
  referral_partial: "Ad click (no click ID)",
  message_text: "Click ID in message",
  none: "No ad attribution",
};

function scoreClass(score: number) {
  if (score >= 70) return "bg-success/15 text-success border-success/30";
  if (score >= 40) return "bg-warning/15 text-warning border-warning/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

function formatGap(s: number) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

function signalEntries(signals: Record<string, unknown> | null | undefined) {
  if (!signals) return [];
  return Object.entries(signals).filter(
    ([, v]) => v !== null && v !== undefined && v !== false && v !== 0 && v !== ""
  );
}

export const LiveFeedItem = ({
  phoneNumber,
  message,
  timestamp,
  status,
  campaign,
  qualityScore,
  attributionSource,
  signals,
  isRepeat,
  clickToMessageSeconds,
}: LiveFeedItemProps) => {
  const getStatusBadge = () => {
    switch (status) {
      case "verified":
        return (
          <span className="badge-verified">
            <CheckCircle className="w-3 h-3" />
            Verified
          </span>
        );
      case "pending":
        return (
          <span className="badge-pending">
            <AlertTriangle className="w-3 h-3" />
            Pending
          </span>
        );
      case "trash":
        return (
          <span className="badge-trash">
            <XCircle className="w-3 h-3" />
            Trash
          </span>
        );
    }
  };

  const entries = signalEntries(signals);

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors slide-in">
      <div className="p-2 rounded-lg bg-success/10">
        <MessageCircle className="w-5 h-5 text-success" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-medium text-foreground">{phoneNumber}</span>
          {getStatusBadge()}
          {typeof qualityScore === "number" && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded-full border cursor-help ${scoreClass(qualityScore)}`}
                  >
                    Score {qualityScore}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium mb-1">Why this score</p>
                  {entries.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No signals recorded</p>
                  ) : (
                    <ul className="text-xs space-y-0.5">
                      {entries.map(([k, v]) => (
                        <li key={k}>
                          <span className="text-muted-foreground">{k.replace(/_/g, " ")}:</span>{" "}
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </li>
                      ))}
                    </ul>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">{message}</p>
        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs">
          {attributionSource && (
            <span
              className={`inline-flex items-center gap-1 ${
                attributionSource === "referral" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Link2 className="w-3 h-3" />
              {ATTRIBUTION_LABELS[attributionSource] ?? attributionSource}
            </span>
          )}
          {typeof clickToMessageSeconds === "number" && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Timer className="w-3 h-3" />
              {formatGap(clickToMessageSeconds)} click → message
            </span>
          )}
          {isRepeat && (
            <span className="inline-flex items-center gap-1 text-warning">
              <Repeat className="w-3 h-3" />
              Repeat sender
            </span>
          )}
          {campaign && <span className="text-primary">Ad: {campaign}</span>}
        </div>
      </div>

      <div className="flex flex-col items-end">
        <span className="text-xs text-muted-foreground">{timestamp}</span>
        {status === "verified" && <div className="pulse-dot mt-2" />}
      </div>
    </div>
  );
};
