import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, ChevronDown, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { useAgency } from "@/hooks/useAgency";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClientSwitcher() {
  const { t } = useTranslation();
  const { clients, selectedClient, setSelectedClient, canManage, createClient, isIndividual } = useAgency();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Individual accounts have exactly one business; nothing to switch.
  if (isIndividual) return null;

  const isFirst = clients.length === 0;

  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      toast.error(t("clientSwitcher.nameRequired"));
      return;
    }

    setIsCreating(true);
    const { client, limitReached } = await createClient(newClientName.trim());
    setIsCreating(false);

    if (client) {
      setSelectedClient(client);
      setNewClientName("");
      setIsDialogOpen(false);
      toast.success(t("clientSwitcher.created"));
    } else {
      toast.error(limitReached ? t("errors.limitClient") : t("clientSwitcher.failed"));
    }
  };

  const dialog = (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isFirst ? t("clientSwitcher.createFirstTitle") : t("clientSwitcher.createTitle")}</DialogTitle>
          <DialogDescription>{isFirst ? t("clientSwitcher.firstDesc") : t("clientSwitcher.createDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="clientName">{t("clientSwitcher.nameLabel")}</Label>
            <Input
              id="clientName"
              placeholder={t("clientSwitcher.namePlaceholder")}
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateClient()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleCreateClient} disabled={isCreating}>
            {isCreating ? t("common.creating") : t("clientSwitcher.createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isFirst && canManage) {
    return (
      <>
        <Button variant="outline" onClick={() => setIsDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("clientSwitcher.addFirst")}
        </Button>
        {dialog}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2 min-w-[200px] justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="truncate max-w-[140px]">{selectedClient?.name || t("clientSwitcher.select")}</span>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[220px]">
          <DropdownMenuLabel>{t("clientSwitcher.switch")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {clients.map((client) => (
            <DropdownMenuItem
              key={client.id}
              onClick={() => setSelectedClient(client)}
              className="flex items-center justify-between"
            >
              <span className="truncate">{client.name}</span>
              {selectedClient?.id === client.id && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))}
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 me-2" />
                {t("clientSwitcher.addNew")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </>
  );
}
