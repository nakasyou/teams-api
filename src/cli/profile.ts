import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ParsedArgs, ResolvedProfile } from './types'
import { DEFAULT_PROFILE_DIR, DEFAULT_PROFILE_NAME } from './constants'
import { loginFromEstsAuthPersistent } from '../auth/estsAuth'

const PROFILE_KEY_REFRESH_TOKEN = 'refreshToken'
const PROFILE_KEY_REFRESH_TOKEN_EXPIRES_IN = 'refreshTokenExpiresIn'
const PROFILE_KEY_ESTSAUTHPERSISTENT = 'ESTSAUTHPERSISTENT'
const PROFILE_KEY_UPDATED_AT = 'updatedAt'

type ProfileState = {
  refreshToken?: string
  refreshTokenExpiresIn?: number
  ESTSAUTHPERSISTENT?: string
  refreshTokenUpdatedAt?: number
}

type ProfileFile = {
  [PROFILE_KEY_REFRESH_TOKEN]?: unknown
  [PROFILE_KEY_REFRESH_TOKEN_EXPIRES_IN]?: unknown
  [PROFILE_KEY_ESTSAUTHPERSISTENT]?: unknown
  [PROFILE_KEY_UPDATED_AT]?: unknown
}

type LoginFromEstsAuthPersistentResponse = {
  refresh_token: string
  refresh_token_expires_in: number
}

export function resolveProfilePath(args: ParsedArgs): string {
  if (args.profileJsonPath) {
    return expandHome(args.profileJsonPath)
  }
  const home = getHomeDirectory()
  const safeName = normalizeProfileName(args.profileName)
  return join(home, DEFAULT_PROFILE_DIR, `${safeName}.json`)
}

export function getProfileLabel(args: ParsedArgs): string {
  if (args.profileJsonPath) {
    return 'profile-json'
  }
  return normalizeProfileName(args.profileName)
}

export async function loadProfileState(path: string): Promise<ProfileState> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as ProfileFile
    return asProfileState(parsed)
  } catch (_error) {
    return {}
  }
}

export async function saveProfile(path: string, state: ProfileState): Promise<void> {
  const directory = dirname(path)
  if (directory !== '.') {
    await mkdir(directory, { recursive: true })
  }
  const payload = JSON.stringify(
    {
      ...toProfileFile(state),
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  )
  await writeFile(path, payload, 'utf8')
}

export async function resolveProfile(args: ParsedArgs): Promise<ResolvedProfile> {
  const profilePath = resolveProfilePath(args)
  const profileLabel = getProfileLabel(args)
  const storedProfile = await loadProfileState(profilePath)

  const estsAuthPersistent = firstDefinedToken(
    args.estsAuthPersistent,
    storedProfile.ESTSAUTHPERSISTENT,
    process.env.ESTSAUTHPERSISTENT,
  )

  if (estsAuthPersistent) {
    const tokenRes = await refreshFromPersistentToken(estsAuthPersistent)
    return {
      token: tokenRes.refresh_token,
      profilePath,
      profileLabel,
      refreshToken: tokenRes.refresh_token,
      refreshTokenExpiresIn: tokenRes.refresh_token_expires_in,
      refreshTokenUpdatedAt: Date.now(),
      ESTSAUTHPERSISTENT: estsAuthPersistent,
    }
  }

  const legacyRefreshToken = firstDefinedToken(
    args.refreshToken,
    storedProfile.refreshToken,
    process.env.REFRESH_TOKEN,
  )
  if (!legacyRefreshToken) {
    throw new Error(
      'No authentication token found. Use --ests-auth-persistent, --refresh-token (deprecated), or set ESTSAUTHPERSISTENT/REFRESH_TOKEN in env.',
    )
  }

  const isRefreshTokenExpired = shouldRefreshByExpiration(
    storedProfile.refreshTokenExpiresIn,
    storedProfile.refreshTokenUpdatedAt,
  )

  if (isRefreshTokenExpired && estsAuthPersistent) {
    const tokenRes = await refreshFromPersistentToken(estsAuthPersistent)
    return {
      token: tokenRes.refresh_token,
      profilePath,
      profileLabel,
      refreshToken: tokenRes.refresh_token,
      refreshTokenExpiresIn: tokenRes.refresh_token_expires_in,
      refreshTokenUpdatedAt: Date.now(),
      ESTSAUTHPERSISTENT: estsAuthPersistent,
    }
  }

  return {
    token: legacyRefreshToken,
    profilePath,
    profileLabel,
    refreshToken: legacyRefreshToken,
    refreshTokenExpiresIn: storedProfile.refreshTokenExpiresIn,
    refreshTokenUpdatedAt: storedProfile.refreshTokenUpdatedAt,
    ESTSAUTHPERSISTENT: estsAuthPersistent ?? storedProfile.ESTSAUTHPERSISTENT,
  }
}

export async function resolveRefreshTokenForStore(args: ParsedArgs): Promise<ProfileState> {
  const estsAuthPersistent = firstDefinedToken(
    args.estsAuthPersistent,
    process.env.ESTSAUTHPERSISTENT,
  )
  if (estsAuthPersistent) {
    const tokenRes = await refreshFromPersistentToken(estsAuthPersistent)
    return {
      refreshToken: tokenRes.refresh_token,
      refreshTokenExpiresIn: tokenRes.refresh_token_expires_in,
      ESTSAUTHPERSISTENT: estsAuthPersistent,
    }
  }

  const refreshToken = firstDefinedToken(args.refreshToken, process.env.REFRESH_TOKEN)
  if (!refreshToken) {
    throw new Error(
      'login requires --ests-auth-persistent (recommended) or --refresh-token (deprecated).',
    )
  }
  return {
    refreshToken,
  }
}

async function refreshFromPersistentToken(
  estsAuthPersistent: string,
): Promise<LoginFromEstsAuthPersistentResponse> {
  return loginFromEstsAuthPersistent(estsAuthPersistent)
}

function firstDefinedToken(...tokens: Array<string | undefined>): string | undefined {
  for (const token of tokens) {
    const normalized = normalizeToken(token)
    if (normalized) {
      return normalized
    }
  }
  return undefined
}

function shouldRefreshByExpiration(
  refreshTokenExpiresIn: number | undefined,
  updatedAt: number | undefined,
): boolean {
  if (typeof refreshTokenExpiresIn !== 'number' || typeof updatedAt !== 'number') {
    return false
  }
  const expiresAt = updatedAt + refreshTokenExpiresIn * 1000
  const now = Date.now()
  // 5 minutes early to avoid edge cases around token expiry.
  return expiresAt - 5 * 60 * 1000 <= now
}

function normalizeToken(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeExpiresIn(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined
  }
  return Math.trunc(value)
}

function normalizeUpdatedAt(value: unknown): number | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return undefined
  }
  return parsed
}

function asProfileState(raw: ProfileFile): ProfileState {
  return {
    refreshToken: normalizeToken(raw[PROFILE_KEY_REFRESH_TOKEN]),
    refreshTokenExpiresIn: normalizeExpiresIn(raw[PROFILE_KEY_REFRESH_TOKEN_EXPIRES_IN]),
    ESTSAUTHPERSISTENT: normalizeToken(raw[PROFILE_KEY_ESTSAUTHPERSISTENT]),
    refreshTokenUpdatedAt: normalizeUpdatedAt(raw[PROFILE_KEY_UPDATED_AT]),
  }
}

function toProfileFile(state: ProfileState): ProfileFile {
  const payload: ProfileFile = {}
  if (state.refreshToken) {
    payload[PROFILE_KEY_REFRESH_TOKEN] = state.refreshToken
  }
  if (state.refreshTokenExpiresIn) {
    payload[PROFILE_KEY_REFRESH_TOKEN_EXPIRES_IN] = state.refreshTokenExpiresIn
  }
  if (state.ESTSAUTHPERSISTENT) {
    payload[PROFILE_KEY_ESTSAUTHPERSISTENT] = state.ESTSAUTHPERSISTENT
  }
  return payload
}

function getHomeDirectory(): string {
  const home = process.env.HOME || process.env.USERPROFILE
  if (!home) {
    throw new Error('Cannot resolve home directory (HOME/USERPROFILE not set)')
  }
  return home
}

function normalizeProfileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || DEFAULT_PROFILE_NAME
}

function expandHome(value: string): string {
  if (value === '~') {
    return getHomeDirectory()
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return join(getHomeDirectory(), value.slice(2))
  }
  return value
}
