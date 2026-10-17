/**
 * How a follow-up physically leaves the building (PREPO.md §8.7).
 *
 * Email is a fixed HTTPS call to the provider's own endpoint — no user-supplied
 * URL, so the SSRF surface stays closed (SECURITY.md, A10) — and it is only
 * attempted when a key exists. Without one, a message is marked **failed with the
 * reason** rather than quietly marked sent: the follow-ups page shows that,
 * because a green tick over an email that never left would be a lie.
 */

export type Env = Record<string, string | undefined>;

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
};

export type SendOutcome = {
  delivered: boolean;
  /** Shown next to the row, so it says what actually happened. */
  detail: string;
};

export type EmailSender = {
  name: string;
  send(message: EmailMessage): Promise<SendOutcome>;
};

export const EMAIL_UNCONFIGURED =
  "Not sent: no email provider is configured on this deployment (set RESEND_API_KEY).";

export const PUSH_UNCONFIGURED =
  "Not sent: no device is subscribed to push on this deployment.";

/** Resend's own endpoint. Nothing here is derived from a request. */
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Prepo <onboarding@resend.dev>";

class ResendSender implements EmailSender {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<SendOutcome> {
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.body,
        }),
      });

      if (!response.ok) {
        const problem = await response.text().catch(() => "");
        return {
          delivered: false,
          detail: `Not sent: the email provider refused it (${response.status})${problem ? ` — ${problem.slice(0, 200)}` : ""}.`,
        };
      }

      const result = (await response.json().catch(() => null)) as
        | { id?: string }
        | null;
      return {
        delivered: true,
        detail: result?.id
          ? `Sent to ${message.to} (message ${result.id}).`
          : `Sent to ${message.to}.`,
      };
    } catch (error) {
      return {
        delivered: false,
        detail: `Not sent: the email provider could not be reached (${error instanceof Error ? error.message : "unknown error"}).`,
      };
    }
  }
}

export function emailSender(env: Env = process.env): EmailSender | null {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new ResendSender(key, env.RESEND_FROM?.trim() || DEFAULT_FROM);
}

/**
 * Push has no implementation yet: it needs VAPID keys *and* an installed app
 * holding a subscription, and there is no service worker in this build. The
 * ladder therefore never schedules a push row while no device is subscribed, and
 * the engine refuses one if it finds it — see `PUSH_UNCONFIGURED`.
 */
