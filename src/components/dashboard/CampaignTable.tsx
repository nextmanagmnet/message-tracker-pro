import { TrendingUp, TrendingDown, ExternalLink } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  spend: number;
  realConversations: number;
  trashClicks: number;
  costPerConversation: number;
  change: number;
}

interface CampaignTableProps {
  campaigns: Campaign[];
}

export const CampaignTable = ({ campaigns }: CampaignTableProps) => {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">Campaign Performance</h3>
        <p className="text-sm text-muted-foreground">Real conversations from TikTok campaigns</p>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Spend</th>
              <th>Real Conversations</th>
              <th>Trash Clicks</th>
              <th>Cost / Conversation</th>
              <th>Change</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="group">
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center text-xs font-bold text-primary-foreground">
                      TT
                    </div>
                    <span className="font-medium text-foreground">{campaign.name}</span>
                  </div>
                </td>
                <td className="text-foreground font-medium">${campaign.spend.toLocaleString()}</td>
                <td>
                  <span className="badge-verified">{campaign.realConversations}</span>
                </td>
                <td>
                  <span className="badge-trash">{campaign.trashClicks}</span>
                </td>
                <td className="text-primary font-semibold">
                  ${campaign.costPerConversation.toFixed(2)}
                </td>
                <td>
                  <div className={`flex items-center gap-1 ${campaign.change >= 0 ? "text-success" : "text-destructive"}`}>
                    {campaign.change >= 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span className="font-medium">{Math.abs(campaign.change)}%</span>
                  </div>
                </td>
                <td>
                  <button className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
