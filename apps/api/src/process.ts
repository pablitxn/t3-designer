import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

export type ProcessResult = { stdout: string; stderr: string }

/** A bounded child process with cancellation of the whole process group. */
export function runProcess(command: string, args: string[], options: {
  cwd?: string
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
  timeoutMs?: number
  /** Receives complete lines up to 16 KB; oversized lines are discarded. */
  onStdoutLine?: (line: string) => void
} = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error('Operation cancelled'))
      return
    }
    const child = spawn(command, args, {
      cwd: options.cwd, env: options.env ?? process.env,
      detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const decoder = new StringDecoder('utf8')
    let lineBuffer = ''
    let droppingLine = false
    let stopped: string | null = null
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return
      try {
        if (process.platform === 'win32') child.kill(signal)
        else process.kill(-child.pid, signal)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill(signal)
      }
    }
    const stop = (reason: string) => {
      if (stopped) return
      stopped = reason
      kill('SIGTERM')
      killTimer = setTimeout(() => kill('SIGKILL'), 2_000)
      killTimer.unref()
    }
    const abort = () => stop('Operation cancelled')
    options.signal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => stop('Process timed out'), options.timeoutMs ?? 10 * 60_000)
    timeout.unref()
    const clean = () => {
      clearTimeout(timeout)
      if (killTimer) clearTimeout(killTimer)
      options.signal?.removeEventListener('abort', abort)
    }
    // Keep the useful tail of long Blender logs without unbounded memory growth.
    child.stdout.on('data', (chunk: Buffer) => {
      const text = decoder.write(chunk)
      stdout = (stdout + text).slice(-64_000)
      if (!options.onStdoutLine) return
      const segments = text.split('\n')
      for (let index = 0; index < segments.length; index++) {
        if (!droppingLine) {
          lineBuffer += segments[index]
          if (lineBuffer.length > 16_384) { lineBuffer = ''; droppingLine = true }
        }
        if (index < segments.length - 1) {
          if (!droppingLine) options.onStdoutLine(lineBuffer.replace(/\r$/, ''))
          lineBuffer = ''
          droppingLine = false
        }
      }
    })
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-64_000) })
    child.once('error', (error) => { clean(); reject(error) })
    child.once('close', (code, signal) => {
      clean()
      if (lineBuffer && !droppingLine) options.onStdoutLine?.(lineBuffer.replace(/\r$/, ''))
      if (stopped) reject(new Error(stopped))
      // Child output may contain product content or credentials; it is not a public error message.
      else if (code !== 0) reject(new Error(`Process failed (${signal ?? code})`))
      else resolve({ stdout, stderr })
    })
  })
}
