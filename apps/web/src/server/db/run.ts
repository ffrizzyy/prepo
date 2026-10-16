/** Runs a script only when it is the process entrypoint (see package.json). */
export function runCli(entryFile: string, fn: () => Promise<void>): void {
  const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
  if (!entry.endsWith(entryFile)) return;

  fn()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
