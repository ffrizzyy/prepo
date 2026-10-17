"use client";

import { useActionState } from "react";
import {
  signIn,
  type SignInState,
} from "@/server/auth/actions";
import { Field, FormError, inputClass, primaryButtonClass } from "./fields";

export function SignInForm({
  initialStage = "credentials",
  next,
  defaultEmail,
  defaultPassword,
  submitLabel = "Sign in",
}: {
  initialStage?: "credentials" | "totp";
  next?: string;
  defaultEmail?: string;
  defaultPassword?: string;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    signIn,
    { stage: initialStage, error: null },
  );
  const askingForCode = state.stage === "totp";

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {askingForCode ? (
        <>
          <Field
            label="Two-factor code"
            htmlFor="code"
            hint="The six-digit code from your authenticator app, or one of your recovery codes."
          >
            <input
              id="code"
              name="code"
              inputMode="text"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={20}
              placeholder="123456"
              className={`${inputClass} font-mono tracking-widest`}
            />
          </Field>
          <FormError message={state.error ?? undefined} />
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Checking…" : "Verify code"}
          </button>
        </>
      ) : (
        <>
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={defaultEmail}
              placeholder="you@company.com"
              className={inputClass}
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              defaultValue={defaultPassword}
              className={inputClass}
            />
          </Field>

          <FormError message={state.error ?? undefined} />

          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Signing in…" : submitLabel}
          </button>
        </>
      )}
    </form>
  );
}
