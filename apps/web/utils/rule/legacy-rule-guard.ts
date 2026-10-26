import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
export const RULE_MANAGED_BY_ORGANIZATION_ERROR =
  "旧共享规则暂不支持编辑，请建立个人规则。";
export async function assertRuleIsNotOrgManaged({
  ruleId,
  emailAccountId,
}: {
  ruleId: string;
  emailAccountId: string;
}) {
  const rule = await prisma.rule.findUnique({
    where: { id_emailAccountId: { id: ruleId, emailAccountId } },
    select: { organizationRuleId: true },
  });
  if (rule?.organizationRuleId) {
    throw new SafeError(RULE_MANAGED_BY_ORGANIZATION_ERROR);
  }
}
