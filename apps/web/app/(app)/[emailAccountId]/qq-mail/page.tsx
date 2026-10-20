import { redirect } from "next/navigation";
import { auth } from "@/utils/auth";
import { listImapAccounts } from "@/utils/qq-mail/account";
import { QqMailClient } from "./QqMailClient";

export const maxDuration = 120;

export default async function QqMailPage() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const accounts = await listImapAccounts(session.user.id);

  return <QqMailClient initialAccounts={accounts} />;
}
