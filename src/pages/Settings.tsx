import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  Users, 
  CreditCard, 
  Shield, 
  Bell, 
  Webhook,
  ExternalLink,
  Check
} from "lucide-react";

const Settings = () => {
  return (
    <DashboardLayout
      title="Settings"
      subtitle="Manage your account and integrations"
    >
      <div className="max-w-4xl space-y-6">
        {/* Company Settings */}
        <div className="glass-card p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-xl bg-primary/10">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Company Settings</h3>
              <p className="text-sm text-muted-foreground">
                Manage your organization details
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Company Name</label>
              <input
                type="text"
                defaultValue="Acme Marketing Inc."
                className="w-full mt-1.5 px-4 py-2.5 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Industry</label>
              <select className="w-full mt-1.5 px-4 py-2.5 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option>E-commerce</option>
                <option>Agency</option>
                <option>SaaS</option>
                <option>Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Team Members */}
        <div className="glass-card p-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Team Members</h3>
                <p className="text-sm text-muted-foreground">
                  Manage who has access to this workspace
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm">
              Invite Member
            </Button>
          </div>

          <div className="space-y-3">
            {[
              { name: "John Doe", email: "john@acme.com", role: "Admin" },
              { name: "Jane Smith", email: "jane@acme.com", role: "Member" },
              { name: "Bob Johnson", email: "bob@acme.com", role: "Member" },
            ].map((member) => (
              <div
                key={member.email}
                className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-sm font-semibold text-primary-foreground">
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{member.name}</p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <span className="px-3 py-1 text-xs font-medium rounded-full bg-secondary text-muted-foreground">
                  {member.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Subscription */}
        <div className="glass-card p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-xl bg-primary/10">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Subscription</h3>
                  <p className="text-sm text-muted-foreground">
                    Manage your billing and plan
                  </p>
                </div>
                <span className="badge-verified">Pro Plan</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/50 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Current Period</span>
              <span className="text-sm text-foreground">Dec 1 - Dec 31, 2024</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">WhatsApp Numbers</span>
              <span className="text-sm text-foreground">4 / 10</span>
            </div>
          </div>

          <Button variant="outline">
            Manage Subscription
          </Button>
        </div>

        {/* Integrations */}
        <div className="glass-card p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-xl bg-primary/10">
              <Webhook className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Integrations</h3>
              <p className="text-sm text-muted-foreground">
                Connect your marketing platforms
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {[
              {
                name: "TikTok Ads",
                description: "Connected • Advertiser ID: 723456789...",
                connected: true,
                icon: "🎵",
              },
              {
                name: "WhatsApp Business API",
                description: "Connected • 4 numbers active",
                connected: true,
                icon: "💬",
              },
              {
                name: "Zapier",
                description: "Not connected",
                connected: false,
                icon: "⚡",
              },
            ].map((integration) => (
              <div
                key={integration.name}
                className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl">
                    {integration.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{integration.name}</p>
                      {integration.connected && (
                        <Check className="w-4 h-4 text-success" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {integration.description}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  {integration.connected ? (
                    <>
                      <ExternalLink className="w-4 h-4" />
                      Manage
                    </>
                  ) : (
                    "Connect"
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Security */}
        <div className="glass-card p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-xl bg-primary/10">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Security</h3>
              <p className="text-sm text-muted-foreground">
                Protect your account
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
              <div>
                <p className="font-medium text-foreground">Two-Factor Authentication</p>
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security
                </p>
              </div>
              <Button variant="outline" size="sm">
                Enable
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
              <div>
                <p className="font-medium text-foreground">API Keys</p>
                <p className="text-sm text-muted-foreground">
                  Manage your API access tokens
                </p>
              </div>
              <Button variant="outline" size="sm">
                View Keys
              </Button>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="glass-card p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-xl bg-primary/10">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Notifications</h3>
              <p className="text-sm text-muted-foreground">
                Choose what you want to be notified about
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {[
              { label: "New verified conversation", enabled: true },
              { label: "Daily summary report", enabled: true },
              { label: "Campaign performance alerts", enabled: false },
              { label: "WhatsApp number status changes", enabled: true },
            ].map((notification) => (
              <div
                key={notification.label}
                className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
              >
                <span className="text-foreground">{notification.label}</span>
                <button
                  className={`w-12 h-6 rounded-full transition-colors ${
                    notification.enabled ? "bg-primary" : "bg-secondary"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-foreground transition-transform ${
                      notification.enabled ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
