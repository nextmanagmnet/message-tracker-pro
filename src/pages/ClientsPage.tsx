import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAgency } from "@/hooks/useAgency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { 
  Building2, 
  Plus, 
  MoreVertical, 
  Pencil, 
  Trash2,
  MessageCircle,
  DollarSign,
  TrendingUp
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export default function ClientsPage() {
  const { clients, canManage, createClient, updateClient, deleteClient, setSelectedClient } = useAgency();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedClientForAction, setSelectedClientForAction] = useState<{ id: string; name: string } | null>(null);
  const [clientName, setClientName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!clientName.trim()) {
      toast.error("Please enter a client name");
      return;
    }
    
    setIsLoading(true);
    const client = await createClient(clientName.trim());
    setIsLoading(false);
    
    if (client) {
      toast.success("Client created successfully");
      setClientName("");
      setIsCreateDialogOpen(false);
    } else {
      toast.error("Failed to create client");
    }
  };

  const handleEdit = async () => {
    if (!clientName.trim() || !selectedClientForAction) {
      toast.error("Please enter a client name");
      return;
    }
    
    setIsLoading(true);
    const success = await updateClient(selectedClientForAction.id, clientName.trim());
    setIsLoading(false);
    
    if (success) {
      toast.success("Client updated successfully");
      setClientName("");
      setIsEditDialogOpen(false);
      setSelectedClientForAction(null);
    } else {
      toast.error("Failed to update client");
    }
  };

  const handleDelete = async () => {
    if (!selectedClientForAction) return;
    
    setIsLoading(true);
    const success = await deleteClient(selectedClientForAction.id);
    setIsLoading(false);
    
    if (success) {
      toast.success("Client deleted successfully");
      setIsDeleteDialogOpen(false);
      setSelectedClientForAction(null);
    } else {
      toast.error("Failed to delete client");
    }
  };

  const openEditDialog = (client: { id: string; name: string }) => {
    setSelectedClientForAction(client);
    setClientName(client.name);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (client: { id: string; name: string }) => {
    setSelectedClientForAction(client);
    setIsDeleteDialogOpen(true);
  };

  return (
    <DashboardLayout
      title="Clients"
      subtitle="Manage your client accounts and their integrations"
    >
      {/* Action Bar */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {clients.length} {clients.length === 1 ? "client" : "clients"}
          </span>
        </div>
        {canManage && (
          <Button variant="glow" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Client
          </Button>
        )}
      </div>

      {/* Clients Grid */}
      {clients.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No clients yet</h3>
          <p className="text-muted-foreground mb-6">
            Create your first client to start tracking their TikTok and WhatsApp data.
          </p>
          {canManage && (
            <Button variant="glow" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Client
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((client) => (
            <div key={client.id} className="glass-card p-6 hover:border-primary/50 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{client.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      Added {new Date(client.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(client)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => openDeleteDialog(client)}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Quick Stats (placeholder) */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <MessageCircle className="w-4 h-4 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Leads</p>
                  <p className="font-semibold">--</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <DollarSign className="w-4 h-4 mx-auto mb-1 text-success" />
                  <p className="text-xs text-muted-foreground">Spend</p>
                  <p className="font-semibold">--</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <TrendingUp className="w-4 h-4 mx-auto mb-1 text-accent" />
                  <p className="text-xs text-muted-foreground">Conv.</p>
                  <p className="font-semibold">--</p>
                </div>
              </div>

              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setSelectedClient(client)}
              >
                View Dashboard
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>
              Create a new client to track their TikTok and WhatsApp data separately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="createName">Client Name</Label>
              <Input
                id="createName"
                placeholder="e.g., Acme Corp"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>
              Update the client's name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Client Name</Label>
              <Input
                id="editName"
                placeholder="e.g., Acme Corp"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEdit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedClientForAction?.name}"? 
              This will permanently remove all associated data including WhatsApp numbers, 
              TikTok accounts, campaigns, and leads. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
