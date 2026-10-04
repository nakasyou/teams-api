export const DEFAULT_TENANT_ID = 'organizations'

export function resolveTenantId(tenantId?: string): string {
  const value = (tenantId ?? DEFAULT_TENANT_ID).trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(value)) {
    throw new Error('Invalid tenant ID: use a tenant UUID, domain, or organizations/common')
  }
  return value
}

export function tenantOAuthUrl(endpoint: 'authorize' | 'token', tenantId?: string): string {
  return `https://login.microsoftonline.com/${resolveTenantId(tenantId)}/oauth2/v2.0/${endpoint}`
}
