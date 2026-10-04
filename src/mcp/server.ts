import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { parseArgs } from '../cli/args'
import { teamsToolDescription } from './description'
import type { CliRunner } from './runner'

export function createTeamsMcpServer(runCli: CliRunner, version: string): McpServer {
  const server = new McpServer({ name: 'msteams', version })
  // CLI calls share token profiles; serialize them to avoid racing refresh-token writes.
  let pending = Promise.resolve()
  server.registerTool(
    'teams',
    {
      title: 'Microsoft Teams CLI',
      description: teamsToolDescription,
      inputSchema: {
        args: z
          .array(z.string())
          .min(1)
          .describe(
            'CLI argv excluding teams, e.g. ["notifications", "--limit", "10"]. Put global profile/auth options before the command.',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ args }, extra): Promise<CallToolResult> => {
      try {
        const parsed = parseArgs(args)
        if (
          parsed.command === 'mcp' &&
          !parsed.showHelp &&
          !parsed.commandArgs.some((arg) => arg === '--help' || arg === '-h')
        ) {
          return {
            content: [
              {
                type: 'text',
                text: 'teams mcp starts this server; call a CLI data command instead, or use mcp --help.',
              },
            ],
            isError: true,
          }
        }
      } catch {
        // Let the CLI return its normal argument-parsing errors.
      }
      const execution = pending.then(() => runCli(args, extra.signal))
      pending = execution.then(
        () => {},
        () => {},
      )
      try {
        const output = await execution
        let result: unknown
        try {
          result = JSON.parse(output.stdout) as unknown
        } catch {}
        return {
          content: [
            {
              type: 'text',
              text:
                output.stdout.trimEnd() ||
                output.stderr.trimEnd() ||
                `CLI exited with code ${output.exitCode}`,
            },
          ],
          structuredContent: { ...output, ...(result !== undefined ? { result } : {}) },
          isError: output.exitCode !== 0,
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        }
      }
    },
  )
  return server
}
