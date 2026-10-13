import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canSendOutbound } from "../_shared/outbound-can-send.ts";
import { generateUnsubscribeUrl, prepareCompliantEmail } from "../_shared/send-email.ts";
import { pulseEmailOptions } from "./lib.ts";

Deno.test("pulse email compliance uses the client while authority remains the designer", () => {
  const options = pulseEmailOptions({
    senderUserId: "designer-123",
    recipientUserId: "client-456",
    pulseId: "pulse-789",
    recipient: "client@example.com",
    subject: "This week on Cedar House",
    html: "<p>Weekly Pulse</p>",
    organizationId: "studio-789",
  });

  assertEquals(options.authority, { kind: "designer", userId: "designer-123" });
  assertEquals(options.userId, "client-456");
});

Deno.test("address-only pulse recipient never falls back to sender compliance", () => {
  const options = pulseEmailOptions({
    senderUserId: "designer-123",
    recipientUserId: null,
    pulseId: "pulse-789",
    recipient: "client@example.com",
    subject: "This week on Cedar House",
    html: "<p>Weekly Pulse</p>",
    organizationId: "studio-789",
  });

  assertEquals(options.authority, { kind: "designer", userId: "designer-123" });
  assertEquals(options.userId, undefined);
});

Deno.test("client suppression applies to the recipient profile", async () => {
  const options = pulseEmailOptions({
    senderUserId: "designer-123",
    recipientUserId: "client-456",
    pulseId: "pulse-789",
    recipient: "client@example.com",
    subject: "This week on Cedar House",
    html: "<p>Weekly Pulse</p>",
    organizationId: "studio-789",
  });
  let checkedUserId = "";
  const admin = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          if (table === "profiles") checkedUserId = value;
          return query;
        },
        in: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () => Promise.resolve({ data: { email_suppressed: true }, error: null }),
      };
      return query;
    },
  };

  const result = await prepareCompliantEmail(admin as never, options);
  assertEquals(checkedUserId, "client-456");
  assertEquals(result, { state: "suppressed", reason: "email_suppressed" });
});

Deno.test("pulse unsubscribe token belongs to the client", async () => {
  const previousSecret = Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET");
  Deno.env.set("UNSUBSCRIBE_TOKEN_SECRET", "test-secret-for-pulse-unsubscribe");
  try {
    const options = pulseEmailOptions({
      senderUserId: "designer-123",
      recipientUserId: "client-456",
      pulseId: "pulse-789",
      recipient: "client@example.com",
      subject: "This week on Cedar House",
      html: "<p>Weekly Pulse</p>",
      organizationId: "studio-789",
    });
    const unsubscribe = await generateUnsubscribeUrl(options.userId!, options.notificationType);
    const token = new URL(unsubscribe).searchParams.get("token")!;
    const payload = JSON.parse(atob(token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")));
    assertEquals(payload.sub, "client-456");
  } finally {
    if (previousSecret === undefined) Deno.env.delete("UNSUBSCRIBE_TOKEN_SECRET");
    else Deno.env.set("UNSUBSCRIBE_TOKEN_SECRET", previousSecret);
  }
});

function authorizationClient(role: string, leads: string[], project: { designer_id: string; lead_designer_id: string | null }) {
  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => Promise.resolve({ data: leads.map((user_id) => ({ user_id })), error: null }),
        maybeSingle: () => Promise.resolve(table === "organization_members"
          ? { data: { role }, error: null }
          : { data: project, error: null }),
      };
      return query;
    },
  };
}

Deno.test("pulse send authorization follows active lead and owner rules", async () => {
  const target = { organization_id: "studio-1", project_id: "project-1" };
  const project = { designer_id: "former-designer", lead_designer_id: "lead" };
  assertEquals(await canSendOutbound(authorizationClient("designer", ["lead"], project) as never, target, "lead"), true);
  assertEquals(await canSendOutbound(authorizationClient("designer", ["lead"], project) as never, target, "former-designer"), false);
  assertEquals(await canSendOutbound(authorizationClient("owner", ["lead"], project) as never, target, "owner"), true);
});

Deno.test("project designer is allowed when no active lead exists", async () => {
  const target = { organization_id: "studio-1", project_id: "project-1" };
  const project = { designer_id: "project-designer", lead_designer_id: null };
  assertEquals(await canSendOutbound(authorizationClient("designer", [], project) as never, target, "project-designer"), true);
});
