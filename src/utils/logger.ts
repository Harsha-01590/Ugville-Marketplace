/**
 * Logger utility for structured test output.
 * The only module allowed to touch `console` — everything else logs through here.
 */
export class Logger {
  private static prefix = '🧪';

  /** Writes `message` as-is, for callers that format their own line. */
  static log(message: string): void {
    console.log(message);
  }

  static step(stepName: string): void {
    console.log(`\n${Logger.prefix} --- ${stepName} ---`);
  }

  static info(message: string): void {
    console.log(`   ℹ️  ${message}`);
  }

  static success(message: string): void {
    console.log(`   ✅ ${message}`);
  }

  static warn(message: string): void {
    console.log(`   ⚠️  ${message}`);
  }

  static error(message: string): void {
    console.error(`   ❌ ${message}`);
  }
}
