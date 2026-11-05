"use client";
import { useActionState } from "react";
import { requestAccess } from "@/app/actions";
import type { ActionState } from "@/lib/types";
export function AccessForm({ domain }: { domain: string }) {
  const [state, action, pending] = useActionState(requestAccess, {
    status: "idle",
    message: "",
  } as ActionState);
  return (
    <form action={action} className="access-form">
      <label htmlFor="email">University email</label>
      <div className="inline-form">
        <input
          id="email"
          name="email"
          type="email"
          placeholder={`your.netid@${domain}`}
          autoComplete="email"
          required
          maxLength={254}
          aria-describedby="email-help"
        />
        <button disabled={pending}>{pending ? "Requesting…" : "Request Access"}</button>
      </div>
      <p id="email-help" className="meta">
        For the NYU community. A sign-in link, no password to remember.
      </p>
      {state.message && (
        <p role={state.status === "error" ? "alert" : "status"} className={state.status}>
          {state.message}
        </p>
      )}
    </form>
  );
}
