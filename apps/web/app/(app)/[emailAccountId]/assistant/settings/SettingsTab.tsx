import { AboutSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/AboutSetting";
import { SensitiveDataPolicySetting } from "@/app/(app)/[emailAccountId]/assistant/settings/SensitiveDataPolicySetting";
import { DigestSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/DigestSetting";
import { DraftConfidenceSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftConfidenceSetting";
import { DraftReplies } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftReplies";
import { DraftKnowledgeSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftKnowledgeSetting";
import { FollowUpRemindersSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/FollowUpRemindersSetting";
import { HiddenAiDraftLinksSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/HiddenAiDraftLinksSetting";
import { LearnedPatternsSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/LearnedPatternsSetting";
import { PersonalSignatureSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/PersonalSignatureSetting";
import { SnippetsSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/SnippetsSetting";
import { MultiRuleSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/MultiRuleSetting";
import { WritingStyleSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/WritingStyleSetting";
import { SectionHeader } from "@/components/Typography";
import { env } from "@/env";

const autoDraftDisabled = env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED;

export function SettingsTab() {
  return (
    <div className="max-w-4xl space-y-6">
      {!autoDraftDisabled && (
        <div className="space-y-2">
          <DraftReplies />
          <DraftConfidenceSetting />
        </div>
      )}

      <div className="space-y-2">
        <SectionHeader>更新</SectionHeader>
        <FollowUpRemindersSetting />
        {env.NEXT_PUBLIC_DIGEST_ENABLED && <DigestSetting />}
      </div>

      <div className="space-y-2">
        <SectionHeader>你的表达风格</SectionHeader>
        <WritingStyleSetting />
        <AboutSetting />
        <PersonalSignatureSetting />
        <SnippetsSetting />
      </div>

      {!autoDraftDisabled && (
        <div className="space-y-2">
          <SectionHeader>知识库</SectionHeader>
          <DraftKnowledgeSetting />
          <LearnedPatternsSetting />
        </div>
      )}

      <div className="space-y-2">
        <SectionHeader>高级</SectionHeader>

        <MultiRuleSetting />

        <HiddenAiDraftLinksSetting />
        {!env.NEXT_PUBLIC_SENSITIVE_DATA_POLICY_LOCKED && (
          <SensitiveDataPolicySetting />
        )}
      </div>
    </div>
  );
}
