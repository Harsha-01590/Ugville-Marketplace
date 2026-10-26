/**
 * Logger utility for structured test output.
 */
export class Logger {
  private static prefix = '🧪';

  static step(stepName: string) {
    console.log(`\n${Logger.prefix} --- ${stepName} ---`);
  }

  static info(message: string) {
    console.log(`   ℹ️  ${message}`);
  }

  static success(message: string) {
    console.log(`   ✅ ${message}`);
  }

  static warn(message: string) {
    console.log(`   ⚠️  ${message}`);
  }

  static error(message: string) {
    console.error(`   ❌ ${message}`);
  }
}
