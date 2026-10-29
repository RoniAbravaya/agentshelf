import Link from "next/link";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="text-sm text-slate-600">One account sells and buys. Payments for anything you sell go straight to the PayPal email you enter.</p>
      <AuthForm mode="signup" next={next} />
      <p className="text-sm text-slate-600">
        Already have an account? <Link className="underline" href="/login">Sign in</Link>
      </p>
    </div>
  );
}
