/** A lifetime log budget per media child or proxy; no timers or session label map. */
export class StreamDiagnosticBudget {
  private diagnostics = 0;
  private errors = 0;
  private suppressed = 0;

  constructor(private readonly diagnosticLimit = 64, private readonly errorLimit = 8) {}

  admit(error = false): boolean {
    if (error ? this.errors < this.errorLimit : this.diagnostics < this.diagnosticLimit) {
      if (error) this.errors++; else this.diagnostics++;
      return true;
    }
    this.suppressed = Math.min(Number.MAX_SAFE_INTEGER, this.suppressed + 1);
    return false;
  }

  takeSuppressed(): number {
    const count = this.suppressed;
    this.suppressed = 0;
    return count;
  }
}
