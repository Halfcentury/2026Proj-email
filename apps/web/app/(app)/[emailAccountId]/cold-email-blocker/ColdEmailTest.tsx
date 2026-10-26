import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TestRulesContent } from "@/app/(app)/[emailAccountId]/cold-email-blocker/TestRules";

export function ColdEmailTest() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>测试陌生邮件拦截</CardTitle>

        <CardDescription>检查拦截功能对历史邮件的识别结果。</CardDescription>
      </CardHeader>
      <TestRulesContent />
    </Card>
  );
}
