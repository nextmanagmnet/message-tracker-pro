import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, Plus, MoreVertical, Pencil, Trash2, MessageCircle, DollarSign, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAgency } from "@/hooks/useAgency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ClientsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { clients, canManage, createClient, updateClient, deleteClient, setSelectedClient } = useAgency();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedClientForAction, setSelectedClientForAction] = useState<{ id: string; name: string } | null>(null);
  const [clientName, setClientName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!clientName.trim()) {
      toast.error(t("clientSwitcher.nameRequired"));
      return;
    }

    setIsLoading(true);
    const { client, limitReached } = await createClient(clientName.trim());
    setIsLoading(false);

    if (client) {
      toast.success(t("clientSwitcher.created"));
      setClientName("");
      setIsCreateDialogOpen(false);
    } else {
      toast.error(limitReached ? t("errors.limitClient") : t("clientSwitcher.failed"));
    }
  };

  const handleEdit = async () => {
    if (!clientName.trim() || !selectedClientForAction) {
      toast.error(t("clientSwitcher.nameRequired"));
      return;
    }

    setIsLoading(true);
    const success = await updateClient(selectedClientForAction.id, clientName.trim());
    setIsLoading(false);

    if (success) {
      toast.success(t("clients.updated"));
      setClientName("");
      setIsEditDialogOpen(false);
      setSelectedClientForAction(null);
    } else {
      toast.error(t("clients.updateFailed"));
    }
  };

  const handleDelete = async () => {
    if (!selectedClientForAction) return;

    setIsLoading(true);
    const success = await deleteClient(selectedClientForAction.id);
    setIsLoading(false);

    if (success) {
      toast.success(t("clients.deleted"));
      setIsDeleteDialogOpen(false);
      setSelectedClientForAction(null);
    } else {
      toast.error(t("clients.deleteFailed"));
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

  const nameField = (id: string, onEnter: () => void) => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor={id}>{t("clientSwitcher.nameLabel")}</Label>
        <Input
          id={id}
          placeholder={t("clientSwitcher.namePlaceholder")}
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter()}
        />
      </div>
    </div>
  );

  return (
    <DashboardLayout title={t("clients.title")} subtitle={t("clients.subtitle")}>
      <div className="flex items-center justify-between mb-8">
        <span className="text-sm text-muted-foreground">{t("clients.count", { count: clients.length })}</span>
        {canManage && (
          <Button variant="glow" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            {t("clients.add")}
          </Button>
        )}
      </div>

      {clients.length === 0 ? (
        <div className="dark wob-mesh-cool rounded-2xl p-12 text-center text-white">
          <Building2 className="w-12 h-12 mx-auto mb-4 text-white/80" />
          <h3 className="text-lg font-semibold mb-2">{t("clients.emptyTitle")}</h3>
          <p className="text-white/75 mb-6">{t("clients.emptyDesc")}</p>
          {canManage && (
            <Button variant="glow" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4" />
              {t("clients.addFirst")}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((client) => (
            <div key={client.id} className="glass-card p-6 hover:border-primary/50 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{client.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t("clients.added", { date: new Date(client.created_at).toLocaleDateString(i18n.language) })}
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
                        <Pencil className="w-4 h-4 me-2" />
                        {t("common.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openDeleteDialog(client)} className="text-destructive">
                        <Trash2 className="w-4 h-4 me-2" />
                        {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <MessageCircle className="w-4 h-4 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">{t("clients.leads")}</p>
                  <p className="font-semibold">--</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <DollarSign className="w-4 h-4 mx-auto mb-1 text-brand-aqua" />
                  <p className="text-xs text-muted-foreground">{t("clients.spend")}</p>
                  <p className="font-semibold">--</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <TrendingUp className="w-4 h-4 mx-auto mb-1 text-accent" />
                  <p className="text-xs text-muted-foreground">{t("clients.conversions")}</p>
                  <p className="font-semibold">--</p>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSelectedClient(client);
                  navigate("/");
                }}
              >
                {t("clients.viewDashboard")}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clientSwitcher.createTitle")}</DialogTitle>
            <DialogDescription>{t("clientSwitcher.createDesc")}</DialogDescription>
          </DialogHeader>
          {nameField("createName", handleCreate)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={isLoading}>
              {isLoading ? t("common.creating") : t("clientSwitcher.createButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clients.editTitle")}</DialogTitle>
            <DialogDescription>{t("clients.editDesc")}</DialogDescription>
          </DialogHeader>
          {nameField("editName", handleEdit)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleEdit} disabled={isLoading}>
              {isLoading ? t("common.saving") : t("clients.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clients.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("clients.deleteDesc", { name: selectedClientForAction?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
