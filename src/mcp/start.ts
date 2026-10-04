import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import packageJson from '../../package.json'
import { createTeamsMcpServer } from './server'
import { createCliRunner } from './runner'

export async function startTeamsMcpServer(cliPath: string, baseArgs: string[] = []): Promise<void> {
  const server = createTeamsMcpServer(createCliRunner(cliPath, baseArgs), packageJson.version)
  await server.connect(new StdioServerTransport())
}
