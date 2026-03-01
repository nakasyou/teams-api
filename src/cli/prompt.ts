import { createInterface } from 'node:readline/promises'

export async function promptEstsAuthPersistentToken(): Promise<string> {
  const reader = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    process.stdout.write(
      'No login token was provided.\n' +
        'Use a browser other than Microsoft Edge, then open\n' +
        'https://login.microsoftonline.com/common/oauth2/v2.0/authorize,\n' +
        'then open DevTools > Application > Cookies, copy ESTSAUTHPERSISTENT, and paste it below.\n',
    )
    const input = await reader.question('ESTSAUTHPERSISTENT: ')
    const token = input.trim()
    if (token.length === 0) {
      throw new Error(
        'Token input was empty. login requires --ests-auth-persistent (recommended) or --refresh-token (deprecated).',
      )
    }
    return token
  } finally {
    reader.close()
  }
}
