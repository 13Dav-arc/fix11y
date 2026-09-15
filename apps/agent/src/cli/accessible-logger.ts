/**
 * Accessible CLI Logger for fix11y Autonomous Agent.
 *
 * Implements WCAG 2.2 / Section 508 accessible terminal output:
 * - Automatically detects screen reader / accessible mode via `--accessible`,
 *   `ACCESSIBLE=true`, or non-TTY pipes.
 * - Suppresses animated spinners, \r carriage-return line overwrites, and ANSI
 *   cursor position jumps in accessible mode to avoid speech synthesizer stuttering.
 * - Outputs clean, flat, line-buffered milestone logs with explicit semantic prefixes.
 */

export type LogLevel = 'start' | 'info' | 'success' | 'warn' | 'error' | 'retry';

export interface LoggerOptions {
  accessibleMode?: boolean;
  noColor?: boolean;
  stream?: NodeJS.WritableStream;
}

export class AccessibleLogger {
  public readonly isAccessible: boolean;
  public readonly noColor: boolean;
  private readonly stream: NodeJS.WritableStream;
  private activeSpinnerInterval: NodeJS.Timeout | null = null;
  private currentSpinnerText = '';

  constructor(options: LoggerOptions = {}) {
    this.stream = options.stream || process.stdout;

    // Detect accessible mode: explicit option > CLI arg > env var > TTY check
    this.isAccessible = Boolean(
      options.accessibleMode !== undefined
        ? options.accessibleMode
        : process.argv.includes('--accessible') ||
          process.env.ACCESSIBLE === 'true' ||
          !(this.stream as NodeJS.WriteStream).isTTY
    );

    // Detect color suppression: explicit option > CLI arg > env var
    this.noColor = Boolean(
      options.noColor !== undefined
        ? options.noColor
        : process.argv.includes('--no-color') ||
          process.env.NO_COLOR !== undefined
    );
  }

  private getTimestamp(): string {
    return new Date().toISOString().substring(11, 19);
  }

  /**
   * Primary accessible milestone logger.
   * Emits flat, line-buffered sequential text with explicit status prefixes.
   */
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (this.activeSpinnerInterval) {
      this.stopSpinner();
    }

    const timestamp = `[${this.getTimestamp()}]`;
    const prefixMap: Record<LogLevel, string> = {
      start:   '[START]  ',
      info:    '[INFO]   ',
      success: '[SUCCESS]',
      warn:    '[WARNING]',
      error:   '[ERROR]  ',
      retry:   '[RETRY]  ',
    };

    const prefix = prefixMap[level] || '[LOG]    ';
    let output = `${timestamp} ${prefix} ${message}`;

    if (context && Object.keys(context).length > 0) {
      const details = Object.entries(context)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(', ');
      output += ` (${details})`;
    }

    // Always output a complete, newline-terminated string for screen-reader buffers
    this.stream.write(`${output}\n`);
  }

  /**
   * Starts a dynamic visual indicator in interactive TTY mode,
   * but outputs a clean static milestone log in accessible mode.
   */
  startStep(stepName: string): void {
    if (this.isAccessible) {
      this.log('start', stepName);
      return;
    }

    // Interactive TTY mode with standard spinner
    const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIdx = 0;
    this.currentSpinnerText = stepName;

    this.activeSpinnerInterval = setInterval(() => {
      const frame = spinnerFrames[frameIdx % spinnerFrames.length];
      const coloredFrame = this.noColor ? frame : `\x1b[36m${frame}\x1b[0m`;
      this.stream.write(`\r${coloredFrame} ${this.currentSpinnerText}`);
      frameIdx++;
    }, 80);
  }

  /**
   * Completes the ongoing step with a success milestone.
   */
  completeStep(successMessage: string): void {
    if (this.isAccessible) {
      this.log('success', successMessage);
      return;
    }

    if (this.activeSpinnerInterval) {
      clearInterval(this.activeSpinnerInterval);
      this.activeSpinnerInterval = null;
      const checkmark = this.noColor ? '✔' : '\x1b[32m✔\x1b[0m';
      this.stream.write(`\r${checkmark} ${successMessage}\n`);
    } else {
      this.log('success', successMessage);
    }
  }

  /**
   * Terminates active spinner cleanly.
   */
  private stopSpinner(): void {
    if (this.activeSpinnerInterval) {
      clearInterval(this.activeSpinnerInterval);
      this.activeSpinnerInterval = null;
      this.stream.write('\n');
    }
  }
}
