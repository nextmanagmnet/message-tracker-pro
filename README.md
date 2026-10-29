# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Environment variables

Copy `.env.example` to `.env` and fill in your Supabase project's URL/anon key
(Project Settings > API in the Supabase dashboard). These are safe to expose
to the browser — they're the public anon key, not a secret.

## Supabase Edge Function secrets

Set these via the Supabase dashboard (Edge Functions > Secrets) or
`supabase secrets set <NAME>=<value>`. `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically and don't need to
be set manually.

| Secret | Used by | Notes |
|---|---|---|
| `WHATSAPP_VERIFY_TOKEN` | `whatsapp-webhook`, `whatsapp-connect` | Meta's webhook handshake token, and the bearer token the QR gateways (Evolution / Green-API) must send. **Required**; gateway deliveries are rejected with 401 until it's set. |
| `WHATSAPP_APP_SECRET` | `whatsapp-webhook` | Meta App Secret; verifies `X-Hub-Signature-256` on Meta Cloud API deliveries. **Required** for the Meta path (fails closed). |
| `WHATSAPP_ACCESS_TOKEN` | `whatsapp-connect`, `refresh-tokens` | WhatsApp Business system-user access token (Meta Cloud API lines only). |
| `TIKTOK_APP_ID` / `TIKTOK_APP_SECRET` | `tiktok-oauth`, `refresh-tokens`, `sync-campaigns` | TikTok for Business app credentials. |
| `META_APP_ID` / `META_APP_SECRET` | `meta-oauth`, `refresh-tokens`, `whatsapp-connect` | Meta app credentials: ad-account login (scopes `ads_read`, `ads_management`, `business_management`), token health checks, embedded signup. |
| `ANTHROPIC_API_KEY` | `analyze-conversation`, `ai-agent`, `ai-followups` | Claude API key. Without it chats aren't analyzed (no Qualified/Client events) and the AI add-on is off. |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | `whatsapp-connect`, AI sends | Self-hosted Evolution API (QR / linked-device WhatsApp). The URL **must be HTTPS**; rotate the key if it was ever shared in plaintext. |
| `CRON_SECRET` | scheduled functions | Optional static override for the scheduled-job auth check. If unset, the DB-generated token in `scheduler_config.cron_token` is used instead (see `drizzle/migrations/0000_scheduler_setup.sql`). |

### Edge functions

| Function | Called by | Purpose |
|---|---|---|
| `whatsapp-connect` | app | Connect WhatsApp lines (QR via Evolution, or Meta Cloud API import). |
| `whatsapp-webhook` | Meta / Evolution / Green-API | Stores every message (both directions), creates leads, fires the "real conversation" event, hands chats to the AI add-on. |
| `analyze-conversation` | cron, every 5 min | Reads chats that have been quiet for 3 minutes and moves leads to Qualified / Client (or Not a lead). |
| `lead-actions` | app | `mark_client`, `mark_not_lead`, `accept_suggestion`, `take_over`, `hand_back`. |
| `conversion-retry` | cron, every 30 min | Re-sends failed or stuck conversion events (max 5 attempts). |
| `tiktok-oauth` / `meta-oauth` | app | Connect ad accounts; pick a Meta dataset. |
| `sync-campaigns` | cron, hourly | Spend, clicks, impressions per campaign (TikTok + Meta). |
| `refresh-tokens` | cron, hourly | Refreshes TikTok tokens, checks Meta and WhatsApp token health. |
| `ai-agent` | webhook / app playground | Optional AI auto-reply with human handoff. |
| `ai-followups` | cron, every 15 min | Optional AI follow-up for quiet leads, within allowed hours. |

### Lead funnel and conversion events

Every lead moves forward only: `new` → `real` → `qualified` → `client` (or
`not_lead`, which stops all further events). Each stage is reported once to
the ad platform the lead came from (`conversion_events` logs every send):

| Stage | TikTok Events API | Meta Conversions API |
|---|---|---|
| real | `Contact` | `Contact` |
| qualified | `SubmitForm` | `Lead` |
| client | `Purchase` (with value) | `Purchase` (with value) |

`analyze-conversation` reports a stage automatically only at ≥ 0.8
confidence; below that it saves a suggestion the user can accept from the
Leads page. Events are skipped (status `skipped`) when the lead has no click
id or the client has no TikTok pixel / Meta dataset connected.

### WhatsApp via QR pairing

`whatsapp-connect` creates the Evolution instance and QR code;
`whatsapp-webhook` receives Meta Cloud API, Evolution and Green-API events.
Meta Click-to-WhatsApp ads carry the click id in the message's ad context.
TikTok doesn't, so TikTok attribution relies on the ad's prefilled message
containing a `ttclid` (and optionally `cid=<campaign>`); a plain `wa.me` link
with no prefilled text never attributes. AI replies and follow-ups can only be
sent on Evolution (QR) lines.

## Database migrations

Schema changes live in two places that both need to be applied to a fresh
database, in this order:

1. `supabase/migrations/*.sql` — via the Supabase CLI (`supabase db push`) or
   pasted into the SQL editor.
2. `drizzle/migrations/*.sql` — applied against `LOVABLE_DB_MIGRATION_URL`
   (see `drizzle.config.ts`); this is where `scheduler_config`,
   `notification_preferences`, and the `pg_cron`/`pg_net` extensions come from.

After applying migrations that change the schema, regenerate
`src/integrations/supabase/types.ts` (`supabase gen types typescript
--project-id <id> > src/integrations/supabase/types.ts`, or let Lovable
resync it) — it's hand-kept-accurate in the meantime but is meant to be
generated, not maintained by hand.
