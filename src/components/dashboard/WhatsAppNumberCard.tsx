import { Phone, CheckCircle, XCircle, MessageCircle, TrendingUp, MoreVertical, Unplug, Trash2, PlugZap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface WhatsAppNumberCardProps {
  id: string;
  phoneNumber: string;
  status: "connected" | "disconnected";
  realMessages: number;
  trashMessages: number;
  lastMessage?: string;
  onDisconnect?: (id: string) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
  onReconnect?: (id: string) => Promise<void>;
}

export const WhatsAppNumberCard = ({
  id,
  phoneNumber,
  status,
  realMessages,
  trashMessages,
  lastMessage,
  onDisconnect,
  onRemove,
  onReconnect,
}: WhatsAppNumberCardProps) => {
  const isConnected = status === "connected";
  const [isLoading, setIsLoading] = useState(false);

  const handleDisconnect = async () => {
    if (!onDisconnect) return;
    setIsLoading(true);
    try {
      await onDisconnect(id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    setIsLoading(true);
    try {
      await onRemove(id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconnect = async () => {
    if (!onReconnect) return;
    setIsLoading(true);
    try {
      await onReconnect(id);
    } finally {
      setIsLoading(false);
    }
  };

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

        <div className="flex items-center gap-2">
          {isConnected && <div className="pulse-dot" />}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isLoading}>
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isConnected ? (
                <DropdownMenuItem onClick={handleDisconnect} disabled={isLoading}>
                  <Unplug className="w-4 h-4 mr-2" />
                  Disconnect
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={handleReconnect} disabled={isLoading}>
                  <PlugZap className="w-4 h-4 mr-2" />
                  Reconnect
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                onClick={handleRemove} 
                disabled={isLoading}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
