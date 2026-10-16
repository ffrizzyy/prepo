"use client";

import { useActionState } from "react";
import { createWorkspace, type AuthFormState } from "@/server/auth/actions";
import { Field, FormError, inputClass, primaryButtonClass } from "./fields";

export function WorkspaceForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    createWorkspace,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <Field
        label="Workspace name"
        htmlFor="name"
        hint="Used for the URL and the ticket prefix. You can rename it later."
      >
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          autoComplete="organization"
          placeholder="Acme Design"
          className={inputClass}
        />
      </Field>

      <FormError message={state?.error ?? undefined} />

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
