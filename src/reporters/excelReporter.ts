import type { Reporter, TestCase, TestResult, FullResult, Suite } from '@playwright/test/reporter';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';

interface Row {
  file: string;
  line: number;
  suite: string;
  test: string;
  status: string;
  durationSec: number;
  retries: number;
  error: string;
  startedAt: string;
}

export default class ExcelReporter implements Reporter {
  private rows: Row[] = [];
  private outputFile: string;

  constructor(options: { outputFile?: string; outputDir?: string } = {}) {
    const fileName = options.outputFile || `test-results-${this.timestamp()}.xlsx`;
    const dir = path.resolve(process.cwd(), options.outputDir || 'reports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.outputFile = path.isAbsolute(fileName) ? fileName : path.join(dir, fileName);
  }

  private timestamp() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  private getSuitePath(test: TestCase): string {
    // Walk up parents, skipping the file-level suite (which equals titlePath()[0])
    const parts: string[] = [];
    let s: Suite | undefined = test.parent;
    while (s) {
      if (s.title) parts.unshift(s.title);
      s = s.parent;
    }
    // First entry is usually the file path - drop it for readability
    if (parts.length && parts[0].endsWith('.ts')) parts.shift();
    // Project name is also part of titlePath - drop empties
    return parts.filter(Boolean).join(' > ');
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const errorMsg = result.errors
      // eslint-disable-next-line no-control-regex -- strips ANSI colour codes from Playwright error messages
      .map((e) => (e.message || '').replace(/\u001b\[[0-9;]*m/g, ''))
      .join('\n---\n');

    this.rows.push({
      file: path.relative(process.cwd(), test.location.file),
      line: test.location.line,
      suite: this.getSuitePath(test),
      test: test.title,
      status: result.status,
      durationSec: Math.round(result.duration / 100) / 10,
      retries: result.retry,
      error: errorMsg,
      startedAt: result.startTime.toISOString(),
    });
  }

  async onEnd(result: FullResult) {
    // Rows arrive in the order tests *finish*, not the order they're
    // declared - retries, worker scheduling, and file discovery order
    // can all reorder that. Sort explicitly by file path then source
    // line so the report always reads top-to-bottom like the specs do.
    this.rows.sort((a, b) => {
      if (a.file !== b.file) return a.file.localeCompare(b.file);
      if (a.line !== b.line) return a.line - b.line;
      return a.retries - b.retries;
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Playwright ExcelReporter';
    workbook.created = new Date();

    // Summary sheet
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Metric', key: 'metric', width: 24 },
      { header: 'Value', key: 'value', width: 30 },
    ];
    const total = this.rows.length;
    const passed = this.rows.filter((r) => r.status === 'passed').length;
    const failed = this.rows.filter((r) => r.status === 'failed' || r.status === 'timedOut').length;
    const skipped = this.rows.filter((r) => r.status === 'skipped').length;
    const interrupted = this.rows.filter((r) => r.status === 'interrupted').length;
    const totalDuration = this.rows.reduce((sum, r) => sum + r.durationSec, 0);

    summary.addRows([
      { metric: 'Overall Status', value: result.status },
      { metric: 'Total Tests', value: total },
      { metric: 'Passed', value: passed },
      { metric: 'Failed', value: failed },
      { metric: 'Skipped', value: skipped },
      { metric: 'Interrupted', value: interrupted },
      { metric: 'Total Duration (s)', value: Math.round(totalDuration * 10) / 10 },
      { metric: 'Generated At', value: new Date().toISOString() },
    ]);
    summary.getRow(1).font = { bold: true };
    summary.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF305496' },
    };
    summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Results sheet
    const sheet = workbook.addWorksheet('Test Results');
    sheet.columns = [
      { header: 'Test Case', key: 'test', width: 70 },
      { header: 'Result', key: 'status', width: 14 },
      { header: 'Suite', key: 'suite', width: 35 },
      { header: 'File', key: 'file', width: 35 },
      { header: 'Duration (s)', key: 'durationSec', width: 14 },
      { header: 'Retries', key: 'retries', width: 10 },
      { header: 'Started At', key: 'startedAt', width: 26 },
      { header: 'Error', key: 'error', width: 80 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF305496' },
    };

    for (const row of this.rows) {
      const added = sheet.addRow(row);
      const statusCell = added.getCell('status');
      const colorMap: Record<string, string> = {
        passed: 'FFC6EFCE',
        failed: 'FFFFC7CE',
        timedOut: 'FFFFC7CE',
        skipped: 'FFFFEB9C',
        interrupted: 'FFFFC7CE',
      };
      const fg = colorMap[row.status];
      if (fg) {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fg },
        };
      }
      added.getCell('error').alignment = { wrapText: true, vertical: 'top' };
    }

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length },
    };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    await workbook.xlsx.writeFile(this.outputFile);

    console.log(`\n[ExcelReporter] Results written to: ${this.outputFile}\n`);
  }
}
