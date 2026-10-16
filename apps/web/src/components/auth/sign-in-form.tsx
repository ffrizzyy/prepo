"use client";

import { useActionState } from "react";
import { signIn, type AuthFormState } from "@/server/auth/actions";
import { Field, FormError, inputClass, primaryButtonClass } from "./fields";

export function SignInForm({
  next,
  defaultEmail,
  defaultPassword,
  submitLabel = "Sign in",
}: {
  next?: string;
  defaultEmail?: string;
  defaultPassword?: string;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signIn,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

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

      <FormError message={state?.error ?? undefined} />

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Signing in…" : submitLabel}
      </button>
    </form>
  );
}
