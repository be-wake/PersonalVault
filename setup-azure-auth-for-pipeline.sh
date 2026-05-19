#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-azure-auth-for-pipeline.sh
#
# Creates a User-assigned Managed Identity, wires it up for GitHub OIDC
# (federated credentials), and grants it Contributor on the resource group
# so GitHub Actions can deploy to Azure without storing any long-lived secret.
#
# Prerequisites:
#   • Azure CLI installed and logged in  (az login --tenant <TENANT_ID>)
#   • jq installed
#
# Usage:
#   chmod +x setup-azure-auth-for-pipeline.sh
#   ./setup-azure-auth-for-pipeline.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
SUBSCRIPTION_ID="ef9e93d1-7eef-465e-9061-f7db4930ad1b"
TENANT_ID="d5c94578-e8c0-458d-93d2-ebf38fc5a2a4"
RESOURCE_GROUP="pdv-rg"
LOCATION="eastus"
IDENTITY_NAME="pdv-github-deployer"
GITHUB_ORG="be-wake"
GITHUB_REPO="PersonalVault"
GITHUB_ENVIRONMENT="production"   # Must match the environment: in your workflow files

# ── Sanity-check login ─────────────────────────────────────────────────────────
echo "🔐  Verifying Azure CLI login..."
az account set --subscription "$SUBSCRIPTION_ID" --tenant "$TENANT_ID"
az account show --query "{sub:id, tenant:tenantId}" -o table
echo ""

# ── 1. Create resource group (idempotent) ─────────────────────────────────────
echo "📦  Ensuring resource group '$RESOURCE_GROUP' exists in $LOCATION..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --subscription "$SUBSCRIPTION_ID" \
  --output none
echo "    ✅  Resource group ready."
echo ""

# ── 2. Create User-assigned Managed Identity ──────────────────────────────────
echo "🪪   Creating User-assigned Managed Identity '$IDENTITY_NAME'..."
IDENTITY=$(az identity create \
  --name "$IDENTITY_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --subscription "$SUBSCRIPTION_ID" \
  --output json)

CLIENT_ID=$(echo "$IDENTITY" | jq -r '.clientId')
OBJECT_ID=$(echo "$IDENTITY" | jq -r '.principalId')
IDENTITY_ID=$(echo "$IDENTITY" | jq -r '.id')

echo "    ✅  Identity created."
echo "    Client ID  : $CLIENT_ID"
echo "    Object ID  : $OBJECT_ID"
echo ""

# ── 3. Assign Contributor role on the resource group ─────────────────────────
echo "🔑  Assigning Contributor role on '$RESOURCE_GROUP'..."
RG_ID=$(az group show --name "$RESOURCE_GROUP" --query id -o tsv)
az role assignment create \
  --assignee-object-id "$OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Contributor" \
  --scope "$RG_ID" \
  --output none
echo "    ✅  Role assigned."
echo ""

# ── 4. Create federated credentials for each workflow trigger ────────────────
# GitHub OIDC subject format: repo:<org>/<repo>:environment:<env>
#   • One credential for the 'production' environment (used by all three workflows)
#   • One credential for branch pushes to main  (workflow_dispatch also uses env cred)

echo "🔗  Creating federated credentials for GitHub OIDC..."

# 4a. Environment-scoped credential (covers workflow jobs with environment: production)
az identity federated-credential create \
  --identity-name "$IDENTITY_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --name "github-env-production" \
  --issuer "https://token.actions.githubusercontent.com" \
  --subject "repo:${GITHUB_ORG}/${GITHUB_REPO}:environment:${GITHUB_ENVIRONMENT}" \
  --audience "api://AzureADTokenExchange" \
  --output none
echo "    ✅  Federated credential: environment:production"

# 4b. Branch-scoped credential for main (fallback / workflow_dispatch without env)
az identity federated-credential create \
  --identity-name "$IDENTITY_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --name "github-branch-main" \
  --issuer "https://token.actions.githubusercontent.com" \
  --subject "repo:${GITHUB_ORG}/${GITHUB_REPO}:ref:refs/heads/main" \
  --audience "api://AzureADTokenExchange" \
  --output none
echo "    ✅  Federated credential: ref:refs/heads/main"
echo ""

# ── 5. Print GitHub secrets to set ────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════════════"
echo "  🎉  Setup complete! Set these in GitHub → Settings → Secrets"
echo "      (Repo level OR inside the 'production' environment):"
echo ""
echo "  Secret name           Value"
echo "  ─────────────────     ─────────────────────────────────────────"
echo "  AZURE_CLIENT_ID       $CLIENT_ID"
echo "  AZURE_TENANT_ID       $TENANT_ID"
echo "  AZURE_SUBSCRIPTION_ID $SUBSCRIPTION_ID"
echo "  JWT_SECRET            <generate a random 64-char string>"
echo ""
echo "  Also set these GitHub Actions Variables (not secrets):"
echo "  AZURE_RG              $RESOURCE_GROUP"
echo ""
echo "  (BACKEND_APP_NAME and FRONTEND_APP_NAME will be set after"
echo "   you run the infra.yml workflow for the first time.)"
echo "════════════════════════════════════════════════════════════════════"
