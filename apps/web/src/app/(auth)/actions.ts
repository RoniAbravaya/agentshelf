"use server";

import { redirect } from "next/navigation";
import { CommerceError, SignupInput, login, signup } from "@agentshelf/core";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";

export type AuthState = { error?: string } | undefined;

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
}

export async function loginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  try {
    const user = await login(await db(), email, password);
    await setSessionCookie(user);
  } catch (err) {
    return { error: err instanceof CommerceError ? err.message : "Sign in failed" };
  }
  redirect(safeNext(form.get("next")));
}

export async function signupAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = SignupInput.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    display_name: form.get("display_name"),
    paypal_payee_email: form.get("paypal_payee_email") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  try {
    const user = await signup(await db(), parsed.data);
    await setSessionCookie(user);
  } catch (err) {
    return { error: err instanceof CommerceError ? err.message : "Sign up failed" };
  }
  redirect(safeNext(form.get("next")));
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/");
}
