export const API_VERSION = 'v1'
export const SUPPORTED_VERSIONS = ['v1']

// Middleware helper for version checking
export function getApiVersion(request: Request): string {
  const url = new URL(request.url)
  // Check X-API-Version header first
  const headerVersion = request.headers.get('X-API-Version')
  if (headerVersion && SUPPORTED_VERSIONS.includes(headerVersion)) {
    return headerVersion
  }
  // Default to latest
  return API_VERSION
}

// Response wrapper that includes version info
export function versionedResponse(data: any, version: string = API_VERSION) {
  return {
    api_version: version,
    ...data
  }
}

// Deprecation warning helper
export function deprecationHeaders(version: string, sunset?: string) {
  const headers: Record<string, string> = {
    'X-API-Version': version,
  }
  if (sunset) {
    headers['Sunset'] = sunset
    headers['Deprecation'] = 'true'
  }
  return headers
}
