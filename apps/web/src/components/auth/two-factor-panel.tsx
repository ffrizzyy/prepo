"use client";

import { useState, useTransition } from "react";
import {
  confirmTotpEnrolment,
  regenerateRecoveryCodes,
  startTotpEnrolment,
  turnOffTotp,
} from "@/server/auth/actions";
import { FormError, FormNote, inputClass } from "./fields";

type Enrolment = { secret: string; otpauth: string };
type Flow = "none" | "disable" | "regenerate";

const secondaryButton =
  "rounded-2 border border-border px-3 py-2 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60";

/**
 * The confirm, disable and regenerate steps all ask for a code the
 * authenticator shows right now, so they share this input.
 */
function CodeForm({
  label,
  pending,
  submitLabel,
  onSubmit,
}: {
  label: string;
  pending: boolean;
  submitLabel: string;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending) onSubmit(code);
      }}
    >
      <div className="space-y-1.5">
        <label
          htmlFor="totp-code"
          className="block text-xs font-medium text-text-muted"
        >
          {label}
        </label>
        <input
          id="totp-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={12}
          required
          className={`${inputClass} w-44 font-mono tracking-widest`}
        />
      </div>
      <button type="submit" disabled={pending} className={secondaryButton}>
        {pending ? "Checking…" : submitLabel}
      </button>
    </form>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-text-muted">
        Recovery codes, shown once, store them now
      </p>
      <ul className="grid gap-1.5 rounded-2 border border-border bg-surface-2 px-3 py-2 font-mono text-xs sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <p className="text-xs text-text-subtle">
        Each works once, in place of a six-digit code, if the authenticator is
        unavailable. Then they are spent.
      </p>
    </div>
  );
}

export function TwoFactorPanel({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [flow, setFlow] = useState<Flow>("none");
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      await task();
    });
  }

  function openFlow(next: Flow) {
    setError(null);
    setFlow(next);
  }

  // Half-way: a secret is issued and waiting to be confirmed.
  if (enrolment) {
    return (
      <div className="space-y-4">
        <FormNote>
          Add the entry to your authenticator app, scan the setup key in or
          type it. Then confirm with the code it now shows.
        </FormNote>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-muted">Setup key</p>
          <code className="block break-all rounded-2 border border-border bg-surface-2 px-3 py-2 font-mono text-xs">
            {enrolment.secret}
          </code>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-muted">Authenticator URI</p>
          <code className="block break-all rounded-2 border border-border bg-surface-2 px-3 py-2 font-mono text-[10px] text-text-muted">
            {enrolment.otpauth}
          </code>
        </div>
        <CodeForm
          label="Code now showing in your app"
          pending={pending}
          submitLabel="Confirm and turn on"
          onSubmit={(code) =>
            run(async () => {
              const result = await confirmTotpEnrolment(code);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setEnrolment(null);
              setCodes(result.recoveryCodes);
              setOn(true);
              setFlow("none");
            })
          }
        />
        <FormError message={error ?? undefined} />
      </div>
    );
  }

  if (flow === "disable") {
    return (
      <div className="space-y-4">
        <FormNote>
          Turning two-factor off lets sign-in run on the password alone.
        </FormNote>
        <CodeForm
          label="Confirm with a code from your app"
          pending={pending}
          submitLabel="Turn off"
          onSubmit={(code) =>
            run(async () => {
              const result = await turnOffTotp(code);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setCodes(null);
              setOn(false);
              setFlow("none");
            })
          }
        />
        <FormError message={error ?? undefined} />
      </div>
    );
  }

  if (flow === "regenerate") {
    return (
      <div className="space-y-4">
        <FormNote>
          New codes replace the current ones: any still-unused old code stops
          working the moment these are issued.
        </FormNote>
        <CodeForm
          label="Confirm with a code from your app"
          pending={pending}
          submitLabel="Generate new codes"
          onSubmit={(code) =>
            run(async () => {
              const result = await regenerateRecoveryCodes(code);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setCodes(result.recoveryCodes);
              setFlow("none");
            })
          }
        />
        <FormError message={error ?? undefined} />
      </div>
    );
  }

  if (on) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm">
          <span className="rounded-full border border-accent-note bg-accent-soft px-2 py-0.5 text-[10px] text-accent-ink">
            On
          </span>
          Sign-in asks for a code after the password.
        </p>
        {codes ? <RecoveryCodes codes={codes} /> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className={secondaryButton}
            onClick={() => openFlow("regenerate")}
          >
            New recovery codes
          </button>
          <button
            type="button"
            disabled={pending}
            className={secondaryButton}
            onClick={() => openFlow("disable")}
          >
            Turn off
          </button>
        </div>
        <FormError message={error ?? undefined} />
      </div>
    );
  }

  // Off: nothing issued, nothing live.
  return (
    <div className="space-y-4">
      <p className="text-sm">
        A second factor is not set up. The password alone grants entry.
      </p>
      <button
        type="button"
        disabled={pending}
        className="w-full rounded-2 border border-border px-3 py-2 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
        onClick={() =>
          run(async () => {
            const result = await startTotpEnrolment();
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setCodes(null);
            setEnrolment({ secret: result.secret, otpauth: result.otpauth });
          })
        }
      >
        {pending ? "Working…" : "Set up two-factor"}
      </button>
      <FormError message={error ?? undefined} />
    </div>
  );
}
