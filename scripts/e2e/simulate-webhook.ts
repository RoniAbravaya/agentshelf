/**
 * Ask PayPal to send a simulated event to the configured sandbox webhook, then
 * report what the receiver did (via the app's HTTP logs or your own inspection).
 *
 * Usage: pnpm tsx scripts/e2e/simulate-webhook.ts [EVENT_TYPE]
 * Requires PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_WEBHOOK_ID in .env.
 */
import { PayPalClient, getEnv, loadRootEnv } from "@agentshelf/core";

(async () => {
  loadRootEnv(process.cwd());
  const env = getEnv();
  const client = PayPalClient.fromEnv();
  if (!client || !env.PAYPAL_WEBHOOK_ID) throw new Error("PayPal sandbox credentials and PAYPAL_WEBHOOK_ID are required");
  const eventType = process.argv[2] ?? "PAYMENT.CAPTURE.COMPLETED";
  const { data } = await client.request<{ id?: string; event_type?: string; summary?: string }>("POST", "/v1/notifications/simulate-event", {
    webhook_id: env.PAYPAL_WEBHOOK_ID,
    event_type: eventType,
  });
  console.log(`PayPal queued simulated ${data.event_type ?? eventType} (event id ${data.id ?? "?"}): ${data.summary ?? ""}`);
  console.log("PayPal delivers it asynchronously; check the receiver's HTTP log for POST /api/webhooks/paypal.");
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
