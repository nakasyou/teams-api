type LoginFromEstsAuthResponse = {
  refresh_token: string
  refresh_token_expires_in: number
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)

  return Array.from(
    bytes,
    (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[b % 66],
  ).join('')
}

function toBase64Url(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input)
  let binary = ''
  for (const b of bytes) {
    binary += String.fromCharCode(b)
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : ''
  if (!base64) {
    throw new Error('btoa is not available in this environment')
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return toBase64Url(digest)
}

function createCodeVerifier(length = 96): string {
  if (length < 43 || length > 128) {
    throw new Error('PKCE code_verifier length must be between 43 and 128')
  }

  return randomString(length)
}

function normalizeCookie(value: string): string {
  return value.trim()
}

export async function loginFromEstsAuthPersistent(
  ESTSAUTHPERSISTENT: string,
): Promise<LoginFromEstsAuthResponse> {
  const authCookie = normalizeCookie(ESTSAUTHPERSISTENT)
  if (!authCookie) {
    throw new Error('ESTSAUTHPERSISTENT must be a non-empty string')
  }

  const AADSSO = 'NA|NoExtension'
  const headers = new Headers({
    cookie: `AADSSO=${AADSSO}; ESTSAUTHPERSISTENT=${authCookie};`,
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  })

  const codeVerifier = createCodeVerifier()
  const codeChallenge = await createCodeChallenge(codeVerifier)

  const authorizeURL = new URL(
    'https://login.microsoftonline.com/83d9219c-a57d-4d58-b3e5-4abef53925a2/oauth2/v2.0/authorize',
  )
  const authorizeParams = new URLSearchParams()
  authorizeParams.set('client_id', '5e3ce6c0-2b1f-4285-8d4b-75ee78787346')
  authorizeParams.set(
    'scope',
    'https://api.spaces.skype.com/.default openid profile offline_access',
  )
  authorizeParams.set('redirect_uri', 'https://teams.cloud.microsoft/v2')
  authorizeParams.set('response_mode', 'fragment')
  authorizeParams.set('response_type', 'code')
  authorizeParams.set('x-client-SKU', 'msal.js.browser')
  authorizeParams.set('x-client-VER', '3.30.0')
  authorizeParams.set('client_info', '1')
  authorizeParams.set('code_challenge', codeChallenge)
  authorizeParams.set('code_challenge_method', 'S256')
  authorizeParams.set('prompt', 'none')
  authorizeParams.set('nonce', '019ca48e-c305-73d9-95d4-59d37586dcb0')
  authorizeParams.set('claims', JSON.stringify({ access_token: { xms_cc: { values: ['CP1'] } } }))
  authorizeParams.set('a', '0')
  authorizeParams.set('mscrid', '53eea0f0-bf71-409b-881c-6a534bbc1c5e')
  authorizeURL.search = authorizeParams.toString()

  const res = await fetch(authorizeURL.toString(), {
    headers,
    body: null,
    method: 'GET',
    redirect: 'manual',
  })
  if (Math.floor(res.status / 100) !== 3) {
    throw new Error(`HTTP error! status: ${res.status}`)
  }

  const loc = res.headers.get('location')
  if (!loc) {
    throw new Error('No location header')
  }

  const locURL = new URL(loc)
  const locURLHash = locURL.hash
  const params = new URLSearchParams(locURLHash.slice(1))
  const code = params.get('code')
  if (!code) {
    throw new Error('No code in location hash')
  }

  const tokenFormData = new URLSearchParams()
  tokenFormData.set('client_id', '5e3ce6c0-2b1f-4285-8d4b-75ee78787346')
  tokenFormData.set('redirect_uri', 'https://teams.cloud.microsoft/v2')
  tokenFormData.set('scope', 'https://api.spaces.skype.com/.default openid profile offline_access')
  tokenFormData.set('code', code)
  tokenFormData.set('x-client-SKU', 'msal.js.browser')
  tokenFormData.set('x-client-VER', '3.30.0')
  tokenFormData.set('x-ms-lib-capability', 'retry-after, h429')
  tokenFormData.set('x-client-current-telemetry', '5|863,0,,,|,')
  tokenFormData.set('x-client-last-telemetry', '5|0|||0,0')
  tokenFormData.set('code_verifier', codeVerifier)
  tokenFormData.set('grant_type', 'authorization_code')
  tokenFormData.set('client_info', '1')

  const tokenRes = (
    await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token?client-request-id=Core-713ccf6c-567d-48bd-be19-b4bc98f1e025',
      {
        headers: {
          Referer: 'https://teams.cloud.microsoft/',
          Origin: 'https://teams.cloud.microsoft',
        },
        body: tokenFormData.toString(),
        method: 'POST',
      },
    )
  ).json() as Promise<LoginFromEstsAuthResponse>

  return tokenRes
}
