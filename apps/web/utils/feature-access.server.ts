import "server-only";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
export async function assertHasAiAccess({
  userId,
}: {
  userId: string;
  hasUserApiKey?: boolean | null;
}) {
  if (
    !(await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    }))
  )
    throw new SafeError("User not found", 404);
}
