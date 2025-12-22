import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { WhatsAppNumberCard } from "@/components/dashboard/WhatsAppNumberCard";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";

const mockNumbers = [
  {
    phoneNumber: "+1 (555) 100-2000",
    status: "connected" as const,
    realMessages: 156,
    trashMessages: 23,
    lastMessage: "Hi, I'd like to know more about your products...",
  },
  {
    phoneNumber: "+1 (555) 200-3000",
    status: "connected" as const,
    realMessages: 98,
    trashMessages: 45,
    lastMessage: "Can you send me the pricing details?",
  },
  {
    phoneNumber: "+1 (555) 300-4000",
    status: "disconnected" as const,
    realMessages: 67,
    trashMessages: 12,
    lastMessage: "Thanks for the information!",
  },
  {
    phoneNumber: "+1 (555) 400-5000",
    status: "connected" as const,
    realMessages: 210,
    trashMessages: 38,
    lastMessage: "I want to place an order for 50 units",
  },
];

const WhatsAppNumbers = () => {
  return (
    <DashboardLayout
      title="WhatsApp Numbers"
      subtitle="Manage your connected WhatsApp Business numbers"
    >
      {/* Action Bar */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary">
            <span className="text-sm text-muted-foreground">Total Numbers:</span>
            <span className="font-semibold text-foreground">4</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-success/10">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="text-sm text-success">3 Connected</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <RefreshCw className="w-4 h-4" />
            Refresh Status
          </Button>
          <Button variant="glow">
            <Plus className="w-4 h-4" />
            Add Number
          </Button>
        </div>
      </div>

      {/* Numbers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockNumbers.map((number, index) => (
          <WhatsAppNumberCard key={index} {...number} />
        ))}

        {/* Add New Card */}
        <button className="glass-card p-6 border-2 border-dashed border-border hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-4 min-h-[240px] group">
          <div className="p-4 rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Plus className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Add WhatsApp Number</p>
            <p className="text-sm text-muted-foreground mt-1">
              Connect via Meta Business
            </p>
          </div>
        </button>
      </div>
    </DashboardLayout>
  );
};

export default WhatsAppNumbers;
