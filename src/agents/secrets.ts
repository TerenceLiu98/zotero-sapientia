/** Masks configured and active credentials in diagnostics. */
export class Redactor {
  private secrets: string[] = [];
  private readonly retainedSecrets = new Set<string[]>();
  private pattern: RegExp | null = null;

  setSecrets(values: Iterable<string>): void {
    this.secrets = [...values];
    this.updatePattern();
  }

  /** Keeps a launched profile covered if its preferences change. */
  retainSecrets(values: Iterable<string>): () => void {
    const retained = [...values];
    this.retainedSecrets.add(retained);
    this.updatePattern();
    return () => {
      this.retainedSecrets.delete(retained);
      this.updatePattern();
    };
  }

  redact(text: string): string {
    return this.pattern ? text.replace(this.pattern, "••••••") : text;
  }

  private updatePattern(): void {
    const values = [...this.secrets, ...[...this.retainedSecrets].flat()];
    // Match both raw text and the escaped form written in JSON diagnostics.
    const alternatives = [
      ...new Set(
        values.flatMap((value) => [value, JSON.stringify(value).slice(1, -1)]),
      ),
    ]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    this.pattern = alternatives.length
      ? new RegExp(alternatives.join("|"), "g")
      : null;
  }
}

const SECRET_OPTION =
  /^--?[a-z0-9-]*(key|token|secret|password|passwd|auth)[a-z0-9-]*(=|$)/i;

/**
 * The values of a profile that must never be shown: every environment value,
 * and any argument that passes a credential.
 */
export function secretValues(profile: {
  args: string[];
  env: Record<string, string>;
}): string[] {
  const values = Object.values(profile.env);
  for (let i = 0; i < profile.args.length; i++) {
    const arg = profile.args[i];
    const match = SECRET_OPTION.exec(arg);
    if (!match) continue;
    if (match[2] === "=") {
      values.push(arg.slice(match[0].length));
    } else if (i + 1 < profile.args.length) {
      values.push(profile.args[++i]);
    }
  }
  return values;
}
