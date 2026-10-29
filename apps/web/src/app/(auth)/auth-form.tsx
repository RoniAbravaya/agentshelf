"use client";

import { useActionState } from "react";
import { loginAction, signupAction, type AuthState } from "./actions";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? loginAction : signupAction, undefined);
  return (
    <form action={action} className="card flex flex-col gap-4 p-5">
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="display_name">
            Your name
          </label>
          <input className="input" id="display_name" name="display_name" required minLength={2} placeholder="Maya Alvarez" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input className="input" id="password" name="password" type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} />
      </div>
      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="paypal_payee_email">
            PayPal email for payouts (optional, defaults to your email)
          </label>
          <input className="input" id="paypal_payee_email" name="paypal_payee_email" type="email" placeholder="sb-seller@business.example.com" />
          <p className="mt-1 text-xs text-muted">Use a sandbox personal or business account email. Buyers pay this account directly; AgentShelf takes no fee.</p>
        </div>
      )}
      {state?.error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button className="btn-primary min-h-12 w-full text-[15px]" type="submit" disabled={pending}>
        {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
