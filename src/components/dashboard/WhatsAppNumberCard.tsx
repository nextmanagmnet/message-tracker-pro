import { Phone, CheckCircle, XCircle, MessageCircle, TrendingUp } from "lucide-react";

interface WhatsAppNumberCardProps {
  phoneNumber: string;
  status: "connected" | "disconnected";
  realMessages: number;
  trashMessages: number;
  lastMessage?: string;
}

export const WhatsAppNumberCard = ({
  phoneNumber,
  status,
  realMessages,
  trashMessages,
  lastMessage,
}: WhatsAppNumberCardProps) => {
  const isConnected = status === "connected";

  return (
    <div className="glass-card p-6 hover:border-primary/30 transition-all duration-300 group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${isConnected ? "bg-success/10" : "bg-destructive/10"}`}>
            <Phone className={`w-5 h-5 ${isConnected ? "text-success" : "text-destructive"}`} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{phoneNumber}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isConnected ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-success" />
                  <span className="text-xs text-success">Connected</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-xs text-destructive">Disconnected</span>
                </>
              )}
            </div>
          </div>
        </div>

        {isConnected && <div className="pulse-dot" />}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 mb-1">
            <MessageCircle className="w-4 h-4 text-success" />
            <span className="text-xs text-muted-foreground">Real Messages</span>
          </div>
          <p className="text-xl font-bold text-success">{realMessages}</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-destructive" />
            <span className="text-xs text-muted-foreground">Trash</span>
          </div>
          <p className="text-xl font-bold text-destructive">{trashMessages}</p>
        </div>
      </div>

      {lastMessage && (
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-1">Last message</p>
          <p className="text-sm text-foreground truncate">{lastMessage}</p>
        </div>
      )}
    </div>
  );
};
