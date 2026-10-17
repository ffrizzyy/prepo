import { loadEnvFiles } from "./env";

/** Runs a script only when it is the process entrypoint (see package.json). */
export function runCli(entryFile: string, fn: () => Promise<void>): void {
  const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
  if (!entry.endsWith(entryFile)) return;

  // Before the body runs, so a script sees the same environment the server does.
  loadEnvFiles();

  fn()
    // A script that sets process.exitCode (a check that failed) keeps it; one
    // that finishes without an opinion exits 0.
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
