import { spawn } from 'node:child_process'

export type CliExecution = {
  exitCode: number
  stdout: string
  stderr: string
}
export type CliRunner = (args: string[], signal?: AbortSignal) => Promise<CliExecution>

export type CliRunnerOptions = {
  /** Extra runtime arguments inserted before the CLI script (for example --preload). */
  execArgs?: string[]
}

export function createCliRunner(
  cliPath: string,
  baseArgs: string[] = [],
  options: CliRunnerOptions = {},
): CliRunner {
  return (args, signal) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [...(options.execArgs ?? []), cliPath, '--json', '--no-color', ...baseArgs, ...args],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          signal,
        },
      )
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk
      })
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk
      })
      child.on('error', reject)
      child.on('close', (code, terminationSignal) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr: stderr || (terminationSignal ? `CLI terminated by ${terminationSignal}` : ''),
        })
      })
    })
}
