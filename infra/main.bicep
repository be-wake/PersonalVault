// targetScope = 'resourceGroup'
// Provisions: App Service Plan + Backend Web App + Frontend Web App

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Short suffix to make resource names globally unique (e.g. vivekverma)')
param appSuffix string

@description('JWT secret for token signing — passed via GitHub Secret, never hardcoded')
@secure()
param jwtSecret string

@description('Node.js runtime version')
param nodeVersion string = 'NODE|20-lts'

// ── Names derived from suffix ─────────────────────────────────────────────────
var planName     = 'pdv-plan-${appSuffix}'
var backendName  = 'pdv-api-${appSuffix}'
var frontendName = 'pdv-web-${appSuffix}'

// ── App Service Plan (Linux B1) ────────────────────────────────────────────────
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: planName
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
    size: 'B1'
    family: 'B'
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true // required for Linux
  }
}

// ── Backend Web App (Node.js Express + SQLite) ────────────────────────────────
resource backendApp 'Microsoft.Web/sites@2023-01-01' = {
  name: backendName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: nodeVersion
      appCommandLine: 'node src/server.js'
      alwaysOn: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'PORT'
          value: '8080'
        }
        {
          name: 'DB_PATH'
          value: '/home/data/pdv.db'
        }
        {
          name: 'JWT_SECRET'
          value: jwtSecret
        }
        {
          name: 'ALLOWED_ORIGINS'
          value: 'https://${frontendName}.azurewebsites.net'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
      ]
    }
  }
}

// ── Frontend Web App (Next.js standalone) ─────────────────────────────────────
resource frontendApp 'Microsoft.Web/sites@2023-01-01' = {
  name: frontendName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: nodeVersion
      appCommandLine: 'node server.js'
      alwaysOn: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'PORT'
          value: '8080'
        }
        {
          name: 'NEXT_PUBLIC_API_URL'
          value: 'https://${backendName}.azurewebsites.net'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
      ]
    }
  }
}

// ── Outputs used by GitHub Actions workflows ───────────────────────────────────
output backendAppName  string = backendApp.name
output frontendAppName string = frontendApp.name
output backendUrl      string = 'https://${backendApp.properties.defaultHostName}'
output frontendUrl     string = 'https://${frontendApp.properties.defaultHostName}'
