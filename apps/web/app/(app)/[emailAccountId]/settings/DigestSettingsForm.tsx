import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import useSWR, { type KeyedMutator } from "swr";
import { z } from "zod";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TimePicker } from "@/components/TimePicker";
import { Toggle } from "@/components/Toggle";
import { MutedText } from "@/components/Typography";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { LoadingContent } from "@/components/LoadingContent";
import { useRules } from "@/hooks/useRules";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { updateDigestEmailDeliveryAction } from "@/utils/actions/email-delivery";
import {
  updateDigestItemsAction,
  updateDigestScheduleAction,
} from "@/utils/actions/settings";
import { ActionType } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { GetDigestScheduleResponse } from "@/app/api/user/digest-schedule/route";
import type { GetDigestStatusResponse } from "@/app/api/user/digest-status/route";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
} from "@/components/ui/select";
import { FormItem } from "@/components/ui/form";
import {
  createCanonicalTimeOfDay,
  dayOfWeekToBitmask,
  bitmaskToDayOfWeek,
} from "@/utils/schedule";
import { getEstimatedDigestDeliveryAt } from "@/utils/digest/schedule";
import { getAccountScopedKey } from "@/utils/swr";
import { reconcileDigestSelection } from "@/app/(app)/[emailAccountId]/settings/digest-selection";

const digestSettingsSchema = z.object({
  selectedItems: z.set(z.string()),
  // Schedule
  schedule: z.string().min(1, "Please select a frequency"),
  dayOfWeek: z.string().min(1, "Please select a day"),
  time: z.string().min(1, "Please select a time"),
});

type DigestSettingsFormValues = z.infer<typeof digestSettingsSchema>;

const frequencies = [
  { value: "daily", label: "天" },
  { value: "weekly", label: "周" },
];

const daysOfWeek = [
  { value: "0", label: "周日" },
  { value: "1", label: "周一" },
  { value: "2", label: "周二" },
  { value: "3", label: "周三" },
  { value: "4", label: "周四" },
  { value: "5", label: "周五" },
  { value: "6", label: "周六" },
];

export function DigestSettingsForm({
  onSuccess,
  showChannelsHint = true,
}: {
  onSuccess?: () => void;
  showChannelsHint?: boolean;
}) {
  const { emailAccountId } = useAccount();
  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
    mutate: mutateRules,
  } = useRules();

  const {
    data: digestStatus,
    isLoading: digestStatusLoading,
    error: digestStatusError,
    mutate: mutateDigestStatus,
  } = useSWR<GetDigestStatusResponse>(
    getAccountScopedKey("/api/user/digest-status", emailAccountId),
  );

  const isLoading = rulesLoading || digestStatusLoading;
  const error = rulesError || digestStatusError;

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="min-h-[200px] w-full" />}
    >
      {rules && digestStatus && (
        <LoadedDigestSettingsForm
          emailAccountId={emailAccountId}
          rules={rules}
          digestStatus={digestStatus}
          mutateRules={mutateRules}
          mutateDigestStatus={mutateDigestStatus}
          onSuccess={onSuccess}
          showChannelsHint={showChannelsHint}
        />
      )}
    </LoadingContent>
  );
}

function LoadedDigestSettingsForm({
  emailAccountId,
  rules,
  digestStatus,
  mutateRules,
  mutateDigestStatus,
  onSuccess,
  showChannelsHint,
}: {
  emailAccountId: string;
  rules: RulesResponse;
  digestStatus: GetDigestStatusResponse;
  mutateRules: KeyedMutator<RulesResponse>;
  mutateDigestStatus: KeyedMutator<GetDigestStatusResponse>;
  onSuccess?: () => void;
  showChannelsHint: boolean;
}) {
  const previousServerSelection = useRef(getSelectedDigestItemIds(rules));
  const [selectedDigestItems, setSelectedDigestItems] = useState<Set<string>>(
    () => getSelectedDigestItemIds(rules),
  );
  const {
    schedule: initialSchedule,
    dayOfWeek: initialDayOfWeek,
    time: initialTime,
  } = getInitialScheduleProps(digestStatus.schedule);

  const {
    handleSubmit,
    formState: { isSubmitting },
    watch,
    setValue,
  } = useForm<DigestSettingsFormValues>({
    resolver: zodResolver(digestSettingsSchema),
    defaultValues: {
      selectedItems: selectedDigestItems,
      schedule: initialSchedule,
      dayOfWeek: initialDayOfWeek,
      time: initialTime,
    },
  });

  const watchedValues = watch();

  useEffect(() => {
    const previousSelection = previousServerSelection.current;
    const nextServerSelection = getSelectedDigestItemIds(rules);
    const availableRuleIds = new Set(rules.map((rule) => rule.id));

    setSelectedDigestItems((currentSelection) =>
      reconcileDigestSelection({
        currentSelection,
        previousServerSelection: previousSelection,
        nextServerSelection,
        availableRuleIds,
      }),
    );
    previousServerSelection.current = nextServerSelection;
  }, [rules]);

  const { executeAsync: executeItems } = useAction(
    updateDigestItemsAction.bind(null, emailAccountId),
    {
      onError: (error) => {
        toastError({
          title: "更新摘要条目失败",
          description: getActionErrorMessage(error.error),
        });
      },
    },
  );

  const { executeAsync: executeSchedule } = useAction(
    updateDigestScheduleAction.bind(null, emailAccountId),
    {
      onError: (error) => {
        toastError({
          title: "更新摘要时间失败",
          description: getActionErrorMessage(error.error),
        });
      },
    },
  );

  // Update form when selectedDigestItems changes
  useEffect(() => {
    setValue("selectedItems", selectedDigestItems);
  }, [selectedDigestItems, setValue]);

  const onSubmit: SubmitHandler<DigestSettingsFormValues> = useCallback(
    async (data) => {
      // Handle items update
      const ruleDigestPreferences: Record<string, boolean> = {};

      // Set all rules to false first
      rules.forEach((rule) => {
        ruleDigestPreferences[rule.id] = false;
      });

      // Then set selected rules to true
      data.selectedItems.forEach((itemId) => {
        ruleDigestPreferences[itemId] = true;
      });

      // Handle schedule update
      const { schedule, dayOfWeek, time } = data;

      let intervalDays: number;
      switch (schedule) {
        case "daily":
          intervalDays = 1;
          break;
        case "weekly":
          intervalDays = 7;
          break;
        default:
          intervalDays = 1;
      }

      const [hourStr, minuteStr] = time.split(":");
      const hour24 = Number.parseInt(hourStr, 10);
      const minute = Number.parseInt(minuteStr, 10);

      const timeOfDay = createCanonicalTimeOfDay(hour24, minute);

      const scheduleUpdateData = {
        intervalDays,
        occurrences: 1,
        daysOfWeek: dayOfWeekToBitmask(Number.parseInt(dayOfWeek, 10)),
        timeOfDay,
      };

      // Execute both updates
      try {
        const [itemsResult, scheduleResult] = await Promise.all([
          executeItems({ ruleDigestPreferences }),
          executeSchedule(scheduleUpdateData),
        ]);

        const itemsFailed = hasActionError(itemsResult);
        const scheduleFailed = hasActionError(scheduleResult);

        await Promise.all([
          itemsFailed ? undefined : mutateRules(),
          scheduleFailed ? undefined : mutateDigestStatus(),
        ]);

        if (itemsFailed || scheduleFailed) {
          return;
        }

        const estimatedDeliveryAt = getEstimatedDigestDeliveryAt(
          scheduleResult?.data?.nextOccurrenceAt
            ? new Date(scheduleResult.data.nextOccurrenceAt)
            : null,
        );

        toastSuccess({
          description: estimatedDeliveryAt
            ? `Saved. Next digest expected around ${formatDigestDeliveryTime(
                estimatedDeliveryAt,
                digestStatus.delivery.timezone,
              )}.`
            : "Digest settings saved.",
        });
        onSuccess?.();
      } catch {
        toastError({
          title: "更新摘要设置失败",
          description: "保存设置失败",
        });
      }
    },
    [
      rules,
      executeItems,
      executeSchedule,
      mutateRules,
      mutateDigestStatus,
      digestStatus.delivery.timezone,
      onSuccess,
    ],
  );

  // Create options for MultiSelectFilter
  const digestOptions = [
    ...rules.map((rule) => ({
      label: rule.name,
      value: rule.id,
    })),
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-8 h-full">
      <div className="space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <Label>摘要邮件包含的内容</Label>
            <MutedText className="mt-1">
              将所选规则的邮件合并为一封摘要。
            </MutedText>
            <div className="mt-3">
              <MultiSelectFilter
                title="摘要条目"
                options={digestOptions}
                selectedValues={selectedDigestItems}
                setSelectedValues={setSelectedDigestItems}
                maxDisplayedValues={3}
              />
            </div>
          </div>

          <div>
            <Label>发送摘要邮件</Label>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              <FormItem>
                <Label htmlFor="frequency-select">每</Label>
                <Select
                  value={watchedValues.schedule}
                  onValueChange={(val) => setValue("schedule", val)}
                >
                  <SelectTrigger id="frequency-select">
                    {watchedValues.schedule
                      ? frequencies.find(
                          (f) => f.value === watchedValues.schedule,
                        )?.label
                      : "请选择…"}
                  </SelectTrigger>
                  <SelectContent>
                    {frequencies.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>

              {watchedValues.schedule !== "daily" && (
                <FormItem>
                  <Label htmlFor="dayofweek-select">on</Label>
                  <Select
                    value={watchedValues.dayOfWeek}
                    onValueChange={(val) => setValue("dayOfWeek", val)}
                  >
                    <SelectTrigger id="dayofweek-select">
                      {watchedValues.dayOfWeek
                        ? daysOfWeek.find(
                            (d) => d.value === watchedValues.dayOfWeek,
                          )?.label
                        : "请选择…"}
                    </SelectTrigger>
                    <SelectContent>
                      {daysOfWeek.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}

              <TimePicker
                id="time-picker"
                label="at"
                value={watchedValues.time}
                onChange={(value) => setValue("time", value)}
              />
            </div>
            <MutedText className="mt-2">
              通常在 5 分钟内发送。
              {digestStatus.delivery.estimatedNextDeliveryAt && (
                <>
                  {" "}
                  下次预计发送时间{" "}
                  {formatDigestDeliveryTime(
                    new Date(digestStatus.delivery.estimatedNextDeliveryAt),
                    digestStatus.delivery.timezone,
                  )}
                  .
                </>
              )}
            </MutedText>
          </div>

          <Button type="submit" loading={isSubmitting} className="mt-4">
            保存
          </Button>
        </form>

        <DigestDeliveryChannels
          emailAccountId={emailAccountId}
          digestStatus={digestStatus}
          mutateDigestStatus={mutateDigestStatus}
          showChannelsHint={showChannelsHint}
        />
      </div>

      <EmailPreview selectedDigestItems={selectedDigestItems} />
    </div>
  );
}

function DigestDeliveryChannels({
  emailAccountId,
  digestStatus,
  mutateDigestStatus,
  showChannelsHint,
}: {
  emailAccountId: string;
  digestStatus: GetDigestStatusResponse | undefined;
  mutateDigestStatus: () => Promise<GetDigestStatusResponse | undefined>;
  showChannelsHint: boolean;
}) {
  const { data: account, isLoading, mutate } = useEmailAccountFull();

  const { execute } = useAction(
    updateDigestEmailDeliveryAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "设置已保存" });
        mutate();
        mutateDigestStatus();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error) ?? "Failed to update",
        });
      },
    },
  );

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-between gap-3">
        <Label>通过邮件发送摘要</Label>
        <Toggle
          name="digestSendEmail"
          enabled={account?.digestSendEmail ?? true}
          disabled={isLoading}
          onChange={(sendEmail) => execute({ sendEmail })}
        />
      </div>
      <DigestDeliveryActivity digestStatus={digestStatus} />
    </div>
  );
}

function DigestDeliveryActivity({
  digestStatus,
}: {
  digestStatus: GetDigestStatusResponse | undefined;
}) {
  const { delivery } = digestStatus ?? {};

  if (!delivery) return null;

  const queuedLabel =
    delivery.queuedItemCount > 0
      ? `${delivery.queuedItemCount} ${
          delivery.queuedItemCount === 1 ? "email" : "emails"
        } queued`
      : null;

  const lastDeliveryLabel = delivery.lastDelivery
    ? delivery.lastDelivery.status === "SENT"
      ? `Last sent ${formatDigestDeliveryTime(
          new Date(delivery.lastDelivery.occurredAt),
          delivery.timezone,
        )}`
      : `Last delivery failed ${formatDigestDeliveryTime(
          new Date(delivery.lastDelivery.occurredAt),
          delivery.timezone,
        )}`
    : null;

  if (!queuedLabel && !lastDeliveryLabel) return null;

  return (
    <MutedText>
      {[queuedLabel, lastDeliveryLabel].filter(Boolean).join(" · ")}
    </MutedText>
  );
}

function EmailPreview({
  selectedDigestItems,
}: {
  selectedDigestItems: Set<string>;
}) {
  const { data: rules } = useRules();

  const selectedDigestNames = Array.from(selectedDigestItems).map(
    (itemId) => rules?.find((rule) => rule.id === itemId)?.name || itemId,
  );

  const { data: htmlContent } = useSWR<string>(
    selectedDigestNames.length > 0
      ? `/api/digest-preview?categories=${encodeURIComponent(JSON.stringify(selectedDigestNames))}`
      : null,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("获取预览失败");
      return response.text();
    },
    { keepPreviousData: true },
  );

  return (
    <div>
      <Label>预览</Label>
      <div className="mt-3 border rounded-lg overflow-hidden bg-slate-50">
        {selectedDigestNames.length > 0 && htmlContent ? (
          <iframe
            title="摘要预览"
            sandbox=""
            className="w-full min-h-[700px] max-h-[700px] bg-white"
            srcDoc={htmlContent}
          />
        ) : (
          <div className="text-center text-slate-500 py-8">
            <p>选择摘要条目后查看预览</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getInitialScheduleProps(
  digestSchedule?: GetDigestScheduleResponse | null,
) {
  const initialSchedule = (() => {
    if (!digestSchedule) return "daily";
    switch (digestSchedule.intervalDays) {
      case 1:
        return "daily";
      case 7:
        return "weekly";
      case 14:
        return "biweekly";
      case 30:
        return "monthly";
      default:
        return "daily";
    }
  })();

  const initialDayOfWeek = (() => {
    if (!digestSchedule || digestSchedule.daysOfWeek == null) return "1";
    const dayOfWeek = bitmaskToDayOfWeek(digestSchedule.daysOfWeek);
    return dayOfWeek !== null ? dayOfWeek.toString() : "1";
  })();

  const initialTime = digestSchedule?.timeOfDay
    ? (() => {
        const hours = new Date(digestSchedule.timeOfDay)
          .getHours()
          .toString()
          .padStart(2, "0");
        const minutes = new Date(digestSchedule.timeOfDay)
          .getMinutes()
          .toString()
          .padStart(2, "0");
        return `${hours}:${minutes}`;
      })()
    : "09:00";

  return {
    schedule: initialSchedule,
    dayOfWeek: initialDayOfWeek,
    time: initialTime,
  };
}

function getSelectedDigestItemIds(rules: RulesResponse) {
  return new Set(
    rules
      .filter((rule) =>
        rule.actions.some((action) => action.type === ActionType.DIGEST),
      )
      .map((rule) => rule.id),
  );
}

function formatDigestDeliveryTime(date: Date, timezone?: string | null) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone || undefined,
  }).format(date);
}

function hasActionError(
  result:
    | {
        serverError?: unknown;
        validationErrors?: unknown;
        bindArgsValidationErrors?: unknown;
      }
    | null
    | undefined,
) {
  return Boolean(
    result?.serverError ||
      result?.validationErrors ||
      result?.bindArgsValidationErrors,
  );
}
