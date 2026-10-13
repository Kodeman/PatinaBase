import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pulseEmailOptions } from "./lib.ts";

Deno.test("pulse email delivery preserves rendered content and designer authority", () => {
  const html = "<html><body>Weekly Pulse &amp; details</body></html>";
  const options = pulseEmailOptions({
    userId: "designer-123",
    pulseId: "pulse-456",
    recipient: "client@example.com",
    subject: "This week on Cedar House",
    html,
  });

  assertEquals(options.authority, { kind: "designer", userId: "designer-123" });
  assertEquals(options.to, "client@example.com");
  assertEquals(options.subject, "This week on Cedar House");
  assertEquals(options.html, html);
  assertEquals(options.category, "engagement");
  assertEquals(options.userId, "designer-123");
  assertEquals(options.notificationType, "weekly_pulse");
  assertEquals(options.ref, { type: "weekly_pulse", id: "pulse-456" });
});
