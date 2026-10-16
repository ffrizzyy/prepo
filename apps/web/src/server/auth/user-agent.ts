import type { ClientType } from "../db/schema";

/**
 * Enough of a user-agent parse to label a device in the sessions list. A full
 * parser is not worth a dependency for a string a person reads once.
 */
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const PLATFORMS: [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

function firstMatch(userAgent: string, table: [RegExp, string][]): string | null {
  for (const [pattern, label] of table) {
    if (pattern.test(userAgent)) return label;
  }
  return null;
}

export function describeDevice(userAgent: string): string {
  const browser = firstMatch(userAgent, BROWSERS);
  const platform = firstMatch(userAgent, PLATFORMS);
  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform ?? "Unknown device";
}

/**
 * The desktop shell sends a Tauri user-agent. A browser tab and an installed PWA
 * are indistinguishable from the server side, so both are recorded as `web`.
 */
export function clientTypeFor(userAgent: string): ClientType {
  return /Tauri/i.test(userAgent) ? "desktop" : "web";
}

/**
 * Keeps only the network part of the address, so the log can notice a change of
 * country without storing a full IP (§9.3 A09).
 */
export function ipPrefixFor(forwardedFor: string | null): string | null {
  const first = forwardedFor?.split(",")[0]?.trim();
  if (!first) return null;

  const address = first.replace(/^\[|\]$/g, "").split("%")[0]!;
  if (address.includes(":")) {
    return address.split(":").slice(0, 3).join(":");
  }
  const octets = address.split(".");
  return octets.length === 4 ? octets.slice(0, 3).join(".") : address;
}
