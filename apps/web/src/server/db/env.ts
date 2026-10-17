import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The Next server loads `.env.local` on its own; the `db:*` scripts run through
 * plain tsx and do not. Without this a key would look configured in the app and
 * be missing from the job that actually sends — the worst kind of half-set-up,
 * because the symptom is a failed row rather than a refused start.
 *
 * Loaded once, and never over an existing value, so
 * `RESEND_API_KEY=… pnpm db:followups` still wins over the file.
 */
let loaded = false;

export function loadEnvFiles(files = [".env.local", ".env"]): void {
  if (loaded) return;
  loaded = true;

  for (const file of files) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
      if (!match) continue;

      const key = match[1]!;
      if (process.env[key] !== undefined) continue;
      process.env[key] = unquote(match[2]!);
    }
  }
}

/**
 * A quoted value ends at its closing quote, so a trailing `# comment` outside
 * the quotes is ignored; an unquoted value is taken to the end of the line,
 * which is what `RESEND_FROM=Prepo <onboarding@resend.dev>` needs.
 */
function unquote(raw: string): string {
  const value = raw.trim();
  const quote = value[0];
  if (quote === '"' || quote === "'") {
    const end = value.indexOf(quote, 1);
    if (end > 0) return value.slice(1, end);
  }
  return value;
}
