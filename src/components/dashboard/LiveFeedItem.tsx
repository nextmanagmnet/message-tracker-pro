import { MessageCircle, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

interface LiveFeedItemProps {
  phoneNumber: string;
  message: string;
  timestamp: string;
  status: "verified" | "pending" | "trash";
  campaign?: string;
}

export const LiveFeedItem = ({
  phoneNumber,
  message,
  timestamp,
  status,
  campaign,
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

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors slide-in">
      <div className="p-2 rounded-lg bg-success/10">
        <MessageCircle className="w-5 h-5 text-success" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-foreground">{phoneNumber}</span>
          {getStatusBadge()}
        </div>
        <p className="text-sm text-muted-foreground truncate">{message}</p>
        {campaign && (
          <p className="text-xs text-primary mt-1">Campaign: {campaign}</p>
        )}
      </div>

      <div className="flex flex-col items-end">
        <span className="text-xs text-muted-foreground">{timestamp}</span>
        {status === "verified" && (
          <div className="pulse-dot mt-2" />
        )}
      </div>
    </div>
  );
};
