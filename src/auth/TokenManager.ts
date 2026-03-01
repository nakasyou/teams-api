export interface ScopeTokenProvider {
  getTokenFromScope(scope: string): Promise<string>
}

type RefreshTokenProvider = () => Promise<{
  refresh_token: string
  refresh_token_expires_in: number
}>

type OAuthRefreshTokenResponse = {
  token_type: 'Bearer'
  scope: string
  expires_in: number
  ext_expires_in: number
  access_token: string
  refresh_token: string
  refresh_token_expires_in?: number
  id_token: string
  client_info: string
}

export class TokenManager implements ScopeTokenProvider {
  #refresh: string
  #refreshTokenExpiresIn: number | undefined
  #refreshTokenProvider: RefreshTokenProvider | undefined
  #tokenCache = new Map<string, { token: string; expiresAt: number }>()

  constructor(
    refreshToken: string,
    refreshTokenExpiresIn?: number,
    refreshTokenProvider?: RefreshTokenProvider,
  ) {
    this.#refresh = refreshToken
    this.#refreshTokenExpiresIn = refreshTokenExpiresIn
    this.#refreshTokenProvider = refreshTokenProvider
  }

  async getToken(scope: string): Promise<string> {
    return this.getTokenFromScope(scope)
  }

  getRefreshToken(): string {
    return this.#refresh
  }

  getRefreshTokenExpiresIn(): number | undefined {
    return this.#refreshTokenExpiresIn
  }

  async getTokenFromScope(scope: string): Promise<string> {
    const cached = this.#tokenCache.get(scope)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token
    }

    let refreshedWithESTS = false
    while (true) {
      const formData = new URLSearchParams()
      formData.append('client_id', '5e3ce6c0-2b1f-4285-8d4b-75ee78787346')
      formData.append('redirect_uri', 'https://teams.cloud.microsoft/v2/auth')
      formData.append('scope', scope)
      formData.append('grant_type', 'refresh_token')
      formData.append('client_info', '1')
      formData.append('x-client-SKU', 'msal.js.browser')
      formData.append('x-client-VER', '3.30.0')
      formData.append('x-ms-lib-capability', 'retry-after, h429')
      formData.append('x-client-current-telemetry', '5|61,0,,,|')
      formData.append('x-client-last-telemetry', '5|0|||0,0')
      formData.append('refresh_token', this.#refresh)

      const newToken = await fetch(
        'https://login.microsoftonline.com/83d9219c-a57d-4d58-b3e5-4abef53925a2/oauth2/v2.0/token?client-request-id=Core-5e01fb3c-a48b-44c9-83fa-2aa7be8fd4e3',
        {
          headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
            origin: 'https://teams.cloud.microsoft',
            referer: 'https://teams.cloud.microsoft/',
          },
          referrer: 'https://teams.cloud.microsoft/',
          body: formData.toString(),
          method: 'POST',
          mode: 'cors',
          credentials: 'include',
        },
      )

      if (!newToken.ok) {
        const tokenError = (await safeParseJson(newToken)) as OAuthRefreshTokenError | undefined
        if (
          !refreshedWithESTS &&
          tokenError?.error === 'invalid_grant' &&
          this.#refreshTokenProvider !== undefined
        ) {
          const fallbackToken = await this.#refreshTokenProvider()
          this.#refresh = fallbackToken.refresh_token
          this.#refreshTokenExpiresIn = fallbackToken.refresh_token_expires_in
          refreshedWithESTS = true
          continue
        }
        throw new Error(`Failed to refresh token: ${newToken.status} ${newToken.statusText}`)
      }

      const newTokenJson = (await newToken.json()) as OAuthRefreshTokenResponse

      this.#refresh = newTokenJson.refresh_token
      this.#refreshTokenExpiresIn = newTokenJson.refresh_token_expires_in
      this.#tokenCache.set(scope, {
        token: newTokenJson.access_token,
        expiresAt: Date.now() + newTokenJson.expires_in * 1000 - 5 * 60 * 1000,
      })

      return newTokenJson.access_token
    }
  }
}

type OAuthRefreshTokenError = {
  error?: string
}

async function safeParseJson(response: Response): Promise<unknown | undefined> {
  try {
    return await response.json()
  } catch (_error) {
    return undefined
  }
}
