# Azure + GitHub Actions Pipeline Setup Guide

This guide walks you through connecting GitHub Actions to your Azure subscription
so the three CI/CD workflows (`infra.yml`, `backend.yml`, `frontend.yml`) can deploy
the Personal Data Vault without storing any long-lived Azure credentials.

---

## Overview

```
GitHub Actions  ──OIDC──►  Azure Managed Identity  ──Contributor──►  pdv-rg
```

Authentication uses **OpenID Connect (OIDC)** — GitHub mints a short-lived token
per job; Azure verifies it against the federated credential you register. No secrets
leave Azure.

---

## Step 1 — Prerequisites

| Tool | Check |
|---|---|
| Azure CLI | `az --version` (≥ 2.50) |
| `jq` | `jq --version` |
| Git | pushed to `be-wake/PersonalVault` on the `main` branch |

Log in to the correct tenant:

```bash
az login --tenant d5c94578-e8c0-458d-93d2-ebf38fc5a2a4
```

---

## Step 2 — Run the setup script

```bash
chmod +x setup-azure-auth-for-pipeline.sh
./setup-azure-auth-for-pipeline.sh
```

The script will:
1. Create resource group `pdv-rg` in `eastus`
2. Create a User-assigned Managed Identity `pdv-github-deployer`
3. Assign it **Contributor** on `pdv-rg`
4. Register two federated credentials (OIDC subjects):
   - `repo:be-wake/PersonalVault:environment:production`
   - `repo:be-wake/PersonalVault:ref:refs/heads/main`
5. Print the exact values you need for GitHub

---

## Step 3 — Create the GitHub `production` environment

1. Go to **https://github.com/be-wake/PersonalVault/settings/environments**
2. Click **New environment** → name it exactly **`production`**
3. (Optional) Add a required reviewer for manual approval before deploys

---

## Step 4 — Set GitHub Secrets

Go to **Settings → Environments → production → Environment secrets** and add:

| Secret name | Value (from script output) |
|---|---|
| `AZURE_CLIENT_ID` | `<client id printed by script>` |
| `AZURE_TENANT_ID` | `d5c94578-e8c0-458d-93d2-ebf38fc5a2a4` |
| `AZURE_SUBSCRIPTION_ID` | `ef9e93d1-7eef-465e-9061-f7db4930ad1b` |
| `JWT_SECRET` | A random 64-char string — generate with: `openssl rand -hex 32` |

> **Why environment secrets?**  All three workflows specify `environment: production`,
> so GitHub will only expose these secrets to jobs running inside that environment.

---

## Step 5 — Set GitHub Variables

Go to **Settings → Environments → production → Environment variables** and add:

| Variable name | Value |
|---|---|
| `AZURE_RG` | `pdv-rg` |

> `BACKEND_APP_NAME` and `FRONTEND_APP_NAME` will be added in Step 7.

---

## Step 6 — Provision Azure infrastructure

1. Go to **Actions → Provision Azure Infrastructure → Run workflow**
2. Fill in:
   - **app_suffix**: `vivekverma` (makes resource names globally unique)
   - **location**: `eastus`
3. Click **Run workflow**
4. Wait ~2 minutes for the Bicep deployment to complete
5. Open the workflow run → **Summary** tab

The summary will show:

| Resource | Value |
|---|---|
| Backend App Name | `pdv-api-vivekverma` |
| Frontend App Name | `pdv-web-vivekverma` |
| Backend URL | `https://pdv-api-vivekverma.azurewebsites.net` |
| Frontend URL | `https://pdv-web-vivekverma.azurewebsites.net` |

---

## Step 7 — Set app-name variables

Back in **Settings → Environments → production → Environment variables**, add:

| Variable name | Value |
|---|---|
| `BACKEND_APP_NAME` | `pdv-api-vivekverma` |
| `FRONTEND_APP_NAME` | `pdv-web-vivekverma` |

---

## Step 8 — Deploy the apps

Trigger the deployment workflows manually (first time) or push to `main`:

```
Actions → Deploy Backend  → Run workflow
Actions → Deploy Frontend → Run workflow
```

Or just push a commit that touches `personal-data-vault/backend/**` or
`personal-data-vault/frontend/**` — the path filters will trigger automatically.

---

## Verify the deployment

```bash
# Backend health check
curl https://pdv-api-vivekverma.azurewebsites.net/health

# Frontend
open https://pdv-web-vivekverma.azurewebsites.net
```

---

## Re-deploy after code changes

| Change | Workflow triggered |
|---|---|
| Push to `backend/**` | `backend.yml` auto-triggers |
| Push to `frontend/**` | `frontend.yml` auto-triggers |
| Infrastructure change | Run `infra.yml` manually |

---

## Troubleshooting

### OIDC 401 — "AADSTS70021: No matching federated identity record found"
- Confirm the federated credential subject matches exactly. For environment-scoped
  jobs it must be `repo:be-wake/PersonalVault:environment:production`.
- Make sure the workflow file has `environment: production` on the job.

### App Service returns "Application Error"
- Check logs: **Azure Portal → pdv-api-vivekverma → Log stream**
- Common causes:
  - `DB_PATH` directory `/home/data/` doesn't exist yet — the app creates it on first run
  - `JWT_SECRET` env var missing — check it was set in GitHub Secrets correctly

### Frontend can't reach backend
- Verify `NEXT_PUBLIC_API_URL` was set correctly during `npm run build` in the workflow
- The value is baked into the Next.js client bundle at build time
