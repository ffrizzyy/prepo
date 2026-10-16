/**
 * Credentials for the seeded demo workspace. They are a real email and password
 * — the demo button signs in through the normal path — and they only work
 * because `db:seed` creates the account. See README.
 */
export const DEMO = {
  email: "lena@northwind.dev",
  password: "prepo-demo-2026",
  workspace: "northwind",
} as const;
