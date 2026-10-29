import Link from "next/link";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="font-display text-[26px] font-extrabold md:text-[32px]">Create your account</h1>
      <p className="text-sm text-ink-2">One account sells and buys. Payments for anything you sell go straight to the PayPal email you enter.</p>
      <AuthForm mode="signup" next={next} />
      <p className="text-sm text-ink-2">
        Already have an account?{" "}
        <Link className="text-accent underline" href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
