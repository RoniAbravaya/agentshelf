import Link from "next/link";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <AuthForm mode="login" next={next} />
      <p className="text-sm text-slate-600">
        New here? <Link className="underline" href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link>
      </p>
      <div className="card p-4 text-xs text-slate-600">
        <p className="font-semibold">Demo accounts (after <code>pnpm db:seed</code>, password <code>demo1234</code>):</p>
        <ul className="mt-1 list-disc pl-4">
          <li>maya@agentshelf.demo - seller with listings</li>
          <li>dan@agentshelf.demo - buyer with spending rules, wallet and agent key</li>
          <li>jess@agentshelf.demo - human buyer</li>
        </ul>
      </div>
    </div>
  );
}
