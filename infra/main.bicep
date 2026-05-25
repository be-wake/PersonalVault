// =============================================================================
// Personal Data Vault — Infrastructure as Code (B4 / B5 / O4 / O5)
//
// Describes the ACTUAL running stack:
//   • Log Analytics workspace            (logs / metrics sink)
//   • Container Apps managed environment (linked to Log Analytics)
//   • Azure Container Registry           (images for api + web)
//   • PostgreSQL Flexible Server + db    (persistent data store)
//   • Key Vault                          (JWT/refresh/stepup/db secrets — O5)
//   • Container App: backend  (pdv-api)
//   • Container App: frontend (pdv-web)
//
// Replaces the previous stale template (App Service + SQLite), which never
// matched what was hand-provisioned.
//
// Secrets are passed in at deploy time (@secure) and stored in Key Vault; the
// Container Apps read them as Key Vault references via a user-assigned identity.
// =============================================================================

targetScope = 'resourceGroup'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Short suffix to make globally-unique names (e.g. vivekverma)')
param appSuffix string

@description('Container image tag to deploy (usually the git SHA)')
param imageTag string = 'latest'

@description('PostgreSQL administrator login')
param pgAdminUser string = 'pdvadmin'

@description('PostgreSQL administrator password')
@secure()
param pgAdminPassword string

@description('JWT signing secret')
@secure()
param jwtSecret string

@description('JWT refresh signing secret')
@secure()
param jwtRefreshSecret string

@description('Step-up token signing secret')
@secure()
param stepUpSecret string

@description('Webhook HMAC signing secret')
@secure()
param webhookHmacSecret string

@description('Base64 32-byte field-encryption KEK')
@secure()
param fieldKekBase64 string

// ── Derived names ─────────────────────────────────────────────────────────────
var lawName       = 'pdv-logs-${appSuffix}'
var envName       = 'pdv-env-${appSuffix}'
var acrName       = 'pdvacr${appSuffix}'           // ACR names: alphanumeric only
var pgName        = 'pdv-postgres-${appSuffix}'
var kvName        = 'pdv-kv-${appSuffix}'
var apiName       = 'pdv-api'
var webName       = 'pdv-web'
var dbName        = 'pdv'
var uamiName      = 'pdv-identity-${appSuffix}'

// ── User-assigned managed identity (ACR pull + Key Vault read) ────────────────
resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: uamiName
  location: location
}

// ── Log Analytics ─────────────────────────────────────────────────────────────
resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: lawName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ── Container Registry ────────────────────────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false   // pull via managed identity, not admin creds
  }
}

// Grant the managed identity AcrPull on the registry.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d' // AcrPull built-in role
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, uami.id, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Key Vault (O5) ────────────────────────────────────────────────────────────
// Best practice: keep purge protection ON. It cannot be turned off after the
// fact, so set it from day one. Soft-delete retention defaults to 90 days.
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// Grant the managed identity "Key Vault Secrets User" so the apps can read refs.
var kvSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
resource kvRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, uami.id, kvSecretsUserRoleId)
  scope: kv
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Seed the vault with the application secrets.
resource secJwt 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'jwt-secret'
  properties: { value: jwtSecret }
}
resource secJwtRefresh 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'jwt-refresh-secret'
  properties: { value: jwtRefreshSecret }
}
resource secStepUp 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'stepup-secret'
  properties: { value: stepUpSecret }
}
resource secWebhook 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'webhook-hmac-secret'
  properties: { value: webhookHmacSecret }
}
resource secKek 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'field-kek-base64'
  properties: { value: fieldKekBase64 }
}

// ── PostgreSQL Flexible Server ────────────────────────────────────────────────
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: pgName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: pgAdminUser
    administratorLoginPassword: pgAdminPassword
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: 7          // O9 — point-in-time restore window
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
  }
}

resource pgDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgres
  name: dbName
}

// Allow other Azure services (the Container Apps) to reach the server.
resource pgFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

var databaseUrl = 'postgresql://${pgAdminUser}:${pgAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${dbName}?sslmode=require'

// Persist the composed connection string in Key Vault so the backend reads it
// like any other secret instead of having the password sit in plain text in
// the Container App's secret config. Depends on the Azure firewall rule so the
// secret is only written once Postgres is reachable from the deploy runner.
resource secDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'database-url'
  properties: { value: databaseUrl }
  dependsOn: [
    pgDatabase
    pgFirewallAzure
  ]
}

// ── Container Apps environment ────────────────────────────────────────────────
resource managedEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: law.properties.customerId
        sharedKey: law.listKeys().primarySharedKey
      }
    }
  }
}

var uamiResId = uami.id

// ── Backend Container App (pdv-api) ───────────────────────────────────────────
resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: apiName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${uamiResId}': {} }
  }
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'    // enables WebSocket upgrade for /v1/ws
        corsPolicy: {
          allowedOrigins: [ 'https://${webName}.${managedEnv.properties.defaultDomain}' ]
          allowCredentials: true
        }
      }
      registries: [
        { server: acr.properties.loginServer, identity: uamiResId }
      ]
      secrets: [
        // Key Vault references (O5) — values never appear in app config.
        // DATABASE_URL is composed in this template (Postgres password +
        // hostname) and written to KV above as `secDatabaseUrl`.
        { name: 'database-url',        keyVaultUrl: secDatabaseUrl.properties.secretUri, identity: uamiResId }
        { name: 'jwt-secret',          keyVaultUrl: secJwt.properties.secretUri,         identity: uamiResId }
        { name: 'jwt-refresh-secret',  keyVaultUrl: secJwtRefresh.properties.secretUri,  identity: uamiResId }
        { name: 'stepup-secret',       keyVaultUrl: secStepUp.properties.secretUri,      identity: uamiResId }
        { name: 'webhook-hmac-secret', keyVaultUrl: secWebhook.properties.secretUri,     identity: uamiResId }
        { name: 'field-kek-base64',    keyVaultUrl: secKek.properties.secretUri,         identity: uamiResId }
      ]
    }
    template: {
      containers: [
        {
          name: apiName
          image: '${acr.properties.loginServer}/pdv-backend:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '8080' }
            { name: 'ALLOWED_ORIGINS', value: 'https://${webName}.${managedEnv.properties.defaultDomain}' }
            { name: 'DATABASE_URL',        secretRef: 'database-url' }
            { name: 'JWT_SECRET',          secretRef: 'jwt-secret' }
            { name: 'JWT_REFRESH_SECRET',  secretRef: 'jwt-refresh-secret' }
            { name: 'STEPUP_SECRET',       secretRef: 'stepup-secret' }
            { name: 'WEBHOOK_HMAC_SECRET', secretRef: 'webhook-hmac-secret' }
            { name: 'PDV_FIELD_KEK_BASE64', secretRef: 'field-kek-base64' }
          ]
          probes: [
            // Both probes hit /health today. /health does NOT touch the DB,
            // so the readiness check is currently a "process is alive" check;
            // see PRODUCTION_READINESS_REVIEW.md §O12 for the planned /ready
            // endpoint that pings Postgres.
            { type: 'Liveness',  httpGet: { path: '/health', port: 8080 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/health', port: 8080 }, periodSeconds: 15 }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [ acrPull, kvRead ]
}

// ── Frontend Container App (pdv-web) ──────────────────────────────────────────
resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: webName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${uamiResId}': {} }
  }
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      // The frontend Dockerfile sets ENV PORT=8080 and EXPOSE 8080. Keep
      // the Container App's targetPort in sync — 3000 would never connect.
      ingress: { external: true, targetPort: 8080, transport: 'auto' }
      registries: [
        { server: acr.properties.loginServer, identity: uamiResId }
      ]
    }
    template: {
      containers: [
        {
          name: webName
          image: '${acr.properties.loginServer}/pdv-frontend:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '8080' }
            { name: 'NEXT_PUBLIC_API_URL', value: 'https://${api.properties.configuration.ingress.fqdn}' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [ acrPull ]
}

// ── Outputs ───────────────────────────────────────────────────────────────────
// Workflows consume these via `az deployment group show … -o json` and then
// set repo Variables so backend.yml / frontend.yml don't hardcode names.
output resourceGroupName string = resourceGroup().name
output location          string = location

output acrName        string = acr.name
output acrLoginServer string = acr.properties.loginServer

output backendAppName string = api.name
output backendFqdn   string = api.properties.configuration.ingress.fqdn
output backendUrl    string = 'https://${api.properties.configuration.ingress.fqdn}'

output frontendAppName string = web.name
output frontendFqdn   string = web.properties.configuration.ingress.fqdn
output frontendUrl    string = 'https://${web.properties.configuration.ingress.fqdn}'

output keyVaultName       string = kv.name
output keyVaultUri        string = kv.properties.vaultUri
output managedIdentityClientId string = uami.properties.clientId
output containerEnvName   string = managedEnv.name
output logAnalyticsName   string = law.name

output postgresFqdn    string = postgres.properties.fullyQualifiedDomainName
output postgresDatabase string = dbName
