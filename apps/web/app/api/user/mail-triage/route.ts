import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { triageStore } from "@/utils/mail-triage/store";

export type MailTriageResponse = Awaited<ReturnType<typeof triageStore.read>>;

export const GET = withEmailAccount("user/mail-triage", async (request) =>
  NextResponse.json(await triageStore.read(request.auth.emailAccountId), {
    headers: { "Cache-Control": "private, no-store" },
  }),
);
