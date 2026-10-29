import Link from "next/link";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="font-display text-[26px] font-extrabold md:text-[32px]">Sign in</h1>
      <AuthForm mode="login" next={next} />
      <p className="text-sm text-ink-2">
        New here?{" "}
        <Link className="text-accent underline" href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
          Create an account
        </Link>
      </p>
      <div className="card p-4 text-xs text-ink-2">
        <p className="font-semibold text-ink">Demo accounts (password demo1234):</p>
        <ul className="mt-1 list-disc pl-4">
          <li>maya@agentshelf.demo — seller with listings</li>
          <li>dan@agentshelf.demo — buyer with spending rules, wallet and agent key</li>
          <li>jess@agentshelf.demo — human buyer</li>
        </ul>
      </div>
    </div>
  );
}
