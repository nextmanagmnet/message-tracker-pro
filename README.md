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
| `WHATSAPP_VERIFY_TOKEN` | `whatsapp-webhook` | Shared secret for Meta's webhook subscription handshake (`hub.verify_token`). |
| `WHATSAPP_APP_SECRET` | `whatsapp-webhook` | Meta App Secret — verifies the `X-Hub-Signature-256` header on every delivery. **Required**; the webhook rejects all POSTs with 401 until this is set. |
| `WHATSAPP_ACCESS_TOKEN` | `whatsapp-connect`, `refresh-tokens` | WhatsApp Business system-user access token. |
| `TIKTOK_APP_ID` / `TIKTOK_APP_SECRET` | `tiktok-oauth`, `refresh-tokens`, `sync-campaigns` | TikTok for Business app credentials. |
| `CRON_SECRET` | `refresh-tokens`, `sync-campaigns` | Optional static override for the scheduled-job auth check. If unset, the DB-generated token in `scheduler_config.cron_token` is used instead (see `drizzle/migrations/0000_scheduler_setup.sql`). |
| `EVOLUTION_API_URL` | `whatsapp-qr`, `whatsapp-webhook-evolution` | Base URL of your self-hosted Evolution API instance (e.g. `https://wa.yourdomain.com`). **Must be HTTPS** — Evolution's API key and every message go over this. |
| `EVOLUTION_API_KEY` | `whatsapp-qr`, `whatsapp-webhook-evolution` | Evolution API's global `apikey`. Rotate it if it was ever shared in chat/plaintext. |
| `EVOLUTION_WEBHOOK_SECRET` | `whatsapp-qr`, `whatsapp-webhook-evolution` | A secret you generate (e.g. `openssl rand -hex 32`) that `whatsapp-qr` registers as the webhook's `Authorization` header when creating an instance, and `whatsapp-webhook-evolution` checks on every delivery. **Required**; the webhook rejects everything with 401 until this is set. |

### WhatsApp via self-hosted QR pairing (Evolution API / Baileys)

The "Add Number" button on the WhatsApp Numbers page connects a client's
WhatsApp by QR code, instead of Meta's WABA import, by talking to an
Evolution API instance you run on your own VPS:

- `whatsapp-qr` creates/looks up one Evolution "instance" per client
  (`wc_<clientId>`), fetches its QR code, and polls `connectionState` until
  the client scans it, at which point it marks the `whatsapp_numbers` row
  `connected`.
- Evolution pushes `MESSAGES_UPSERT`/`CONNECTION_UPDATE` events to
  `whatsapp-webhook-evolution`, which feeds them through the same lead-scoring
  and TikTok-conversion pipeline as the Meta webhook (shared in
  `supabase/functions/_shared/leadIngest.ts`).
- **The field names Evolution returns (QR code location, phone number on
  connect, webhook payload shape) vary across Evolution API versions.** The
  code picks the most common field names for each, but you should do one real
  scan-and-message test after deploying and check the function logs — if the
  connected phone number or incoming messages don't show up, the actual field
  names in your version's responses are logged there to adjust against.
- TikTok doesn't attach click-tracking metadata to WhatsApp messages the way
  Meta's Click-to-WhatsApp ads do, so attribution for this path depends
  entirely on the TikTok ad's prefilled WhatsApp message containing a
  `ttclid`/campaign code (parsed by `extractClidFromText`) — a plain `wa.me`
  link with no prefilled text will never attribute.

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

`supabase/migrations/20261012130000_vault_encrypt_tiktok_tokens.sql` requires
Vault to be enabled for the project first (Dashboard > Database > Vault >
Enable Vault) and drops the plaintext `tiktok_accounts.access_token` /
`refresh_token` columns after backfilling them into Vault — test it against a
branch/staging project before running on production data.
