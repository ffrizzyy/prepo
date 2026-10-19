"use client";

import { useActionState, useEffect, useState } from "react";
import { signUp, type AuthFormState } from "@/server/auth/actions";
import { Field, FormError, FormNote, inputClass, primaryButtonClass } from "./fields";

export function SignUpForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signUp,
    null,
  );
  const [timezone, setTimezone] = useState("");

  // Flow A, step 2: the timezone is detected, not asked for.
  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
  }, []);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="timezone" value={timezone} />

      <Field label="Name" htmlFor="name">
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
          placeholder="Lena Fischer"
          className={inputClass}
        />
      </Field>

      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className={inputClass}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint="At least 12 characters. Checked against nothing but length, for now."
      >
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={200}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      <FormError message={state?.error ?? undefined} />

      <FormNote>
        Passkeys, magic links and the breached-password check are not wired up in
        this build, see the README for what is real and what is not.
      </FormNote>

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
