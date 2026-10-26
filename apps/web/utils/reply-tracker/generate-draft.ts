import { collectIncomingAttachmentContext } from "@/utils/attachments/read-email-attachment";
import { randomUUID } from "node:crypto";
import { buildDraftSources } from "@/utils/ai/email-workspace/draft-sources";
import { resolveKnowledgeSources } from "@/utils/ai/email-workspace/context-sources";
import type { ContextIssue } from "@/utils/ai/email-workspace/types";
import type { ParsedMessage } from "@/utils/types";
import { internalDateToDate, sortByInternalDate } from "@/utils/date";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { extractEmailAddress, extractEmailAddresses } from "@/utils/email";
import { aiDraftReplyWithConfidence } from "@/utils/ai/reply/draft-reply";
import { getReplyWithConfidence, saveReply } from "@/utils/redis/reply";
import { getWritingStyle } from "@/utils/user/get";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { aiExtractRelevantKnowledge } from "@/utils/ai/knowledge/extract";
import { stringifyEmail } from "@/utils/stringify-email";
import { aiExtractFromEmailHistory } from "@/utils/ai/knowledge/extract-from-email-history";
import type { EmailProvider } from "@/utils/email/types";
import { buildDraftReplyBody } from "@/utils/email/reply-body";
import { aiCollectReplyContext } from "@/utils/ai/reply/reply-context-collector";
import { aiGetCalendarAvailability } from "@/utils/ai/calendar/availability";
import {
  getMeetingContext,
  formatMeetingContextForPrompt,
} from "@/utils/meeting-briefs/recipient-context";
import {
  getRecordedMeetingContext,
  formatRecordedMeetingContextForPrompt,
} from "@/utils/meeting-recorder/reply-context";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { meetsDraftReplyConfidenceRequirement } from "@/utils/ai/reply/draft-confidence";
import type { DraftAttribution } from "@/utils/ai/reply/draft-attribution";
import { selectDraftAttachmentsForRule } from "@/utils/attachments/draft-attachments";
import type { SelectedAttachment } from "@/utils/attachments/source-schema";
import { getReplyMemoriesForPrompt } from "@/utils/ai/reply/reply-memory";
import type { DraftContextMetadata } from "@/utils/ai/reply/draft-context-metadata";
import { collectSenderReplyExamples } from "@/utils/reply-tracker/sender-reply-examples";

export type DraftGenerationOptions = {
  initialIssues?: ContextIssue[];
  replyInstructions?: string;
  bypassCache?: boolean;
};
export type DraftGenerationResult = {
  textDraft?: string;

  attachments?: SelectedAttachment[];
  draft: string | null;
  confidence: DraftReplyConfidence;
  attribution: DraftAttribution | null;
  draftContextMetadata?: DraftContextMetadata | null;
};

/**
 * Fetches thread messages and generates draft content in one step
 */
export async function fetchMessagesAndGenerateDraft(
  emailAccount: EmailAccountWithAI,
  threadId: string,
  client: EmailProvider,
  testMessage: ParsedMessage | undefined,
  logger: Logger,
  selectedRuleId?: string,
): Promise<string> {
  const result = await fetchMessagesAndGenerateDraftWithConfidenceThreshold(
    emailAccount,
    threadId,
    client,
    testMessage,
    logger,
    DraftReplyConfidence.ALL_EMAILS,
    selectedRuleId,
  );

  if (result.draft == null) {
    throw new Error("Draft generation did not return content");
  }

  return result.draft;
}

export async function fetchMessagesAndGenerateDraftWithConfidenceThreshold(
  emailAccount: EmailAccountWithAI,
  threadId: string,
  client: EmailProvider,
  testMessage: ParsedMessage | undefined,
  logger: Logger,
  minimumConfidence: DraftReplyConfidence,
  selectedRuleId?: string,
  options: DraftGenerationOptions = {},
): Promise<DraftGenerationResult> {
  const initialIssues: ContextIssue[] = [];
  const { threadMessages, previousConversationMessages } = testMessage
    ? { threadMessages: [testMessage], previousConversationMessages: null }
    : await fetchThreadAndConversationMessages(
        threadId,
        client,
        logger,
        initialIssues,
      );

  const { draft, confidence, attribution, attachments, draftContextMetadata } =
    await generateDraftContent(
      emailAccount,
      threadMessages,
      previousConversationMessages,
      client,
      logger,
      minimumConfidence,
      selectedRuleId,
      { ...options, initialIssues },
    );

  if (draft == null) {
    return {
      draft: null,
      confidence,
      attribution,
      draftContextMetadata,
      ...(attachments?.length ? { attachments } : {}),
    };
  }

  const finalResult = await buildDraftReplyBody({
    text: draft,
    emailAccountId: emailAccount.id,
    userId: emailAccount.userId,
  });

  return {
    draft: finalResult,
    textDraft: draft,
    confidence,
    attribution,
    draftContextMetadata,
    ...(attachments?.length ? { attachments } : {}),
  };
}

/**
 * Fetches thread messages and previous conversation messages
 */
async function fetchThreadAndConversationMessages(
  threadId: string,
  client: EmailProvider,
  logger: Logger,
  issues: ContextIssue[],
): Promise<{
  threadMessages: ParsedMessage[];
  previousConversationMessages: ParsedMessage[] | null;
}> {
  // Providers return chronological order; sort defensively since drafting
  // logic breaks silently if messages arrive out of order.
  const threadMessages = (await client.getThreadMessages(threadId))
    .filter((message) => !message.labelIds?.includes("DRAFT"))
    .sort(sortByInternalDate("asc"));
  const previousConversationMessages = await optionalReplyContext(
    "同发件人历史邮件",
    () =>
      client.getPreviousConversationMessages(
        threadMessages.map((msg) => msg.id),
      ),
    null,
    issues,
    logger,
  );

  return {
    threadMessages,
    previousConversationMessages,
  };
}

async function generateDraftContent(
  emailAccount: EmailAccountWithAI,
  threadMessages: ParsedMessage[],
  previousConversationMessages: ParsedMessage[] | null,
  emailProvider: EmailProvider,
  logger: Logger,
  minimumConfidence: DraftReplyConfidence,
  selectedRuleId?: string,
  options: DraftGenerationOptions = {},
): Promise<DraftGenerationResult> {
  const lastMessage = threadMessages.at(-1);

  if (!lastMessage) throw new Error("No message provided");

  const cachedReply =
    options.bypassCache || options.replyInstructions?.trim()
      ? null
      : await getReplyWithConfidence({
          emailAccountId: emailAccount.id,
          messageId: lastMessage.id,
          ruleId: selectedRuleId,
        }).catch((error) => {
          logger.warn("Draft cache unavailable", { error });
          return null;
        });

  if (cachedReply) {
    const meetsThreshold = meetsDraftReplyConfidenceRequirement({
      draftConfidence: cachedReply.confidence,
      minimumConfidence,
    });

    if (meetsThreshold) {
      return {
        draft: cachedReply.reply,
        confidence: cachedReply.confidence,
        attribution: cachedReply.attribution,
        draftContextMetadata: cachedReply.draftContextMetadata
          ? {
              ...cachedReply.draftContextMetadata,
              draft: { confidence: cachedReply.confidence },
            }
          : cachedReply.draftContextMetadata,
        ...(selectedRuleId ? { attachments: cachedReply.attachments } : {}),
      };
    }

    logger.info("Skipping cached draft due to low confidence", {
      emailAccountId: emailAccount.id,
      draftConfidence: cachedReply.confidence,
      minimumConfidence,
      threadId: lastMessage.threadId,
      messageId: lastMessage.id,
    });
  }

  const messages = threadMessages.map((msg, index) => ({
    date: internalDateToDate(msg.internalDate),
    threadId: msg.threadId,
    ...getEmailForLLM(msg, {
      // give more context for the message we're processing
      maxLength: index === threadMessages.length - 1 ? 2000 : 500,
      extractReply: true,
      removeForwarded: false,
      includeLinkUrls: true,
      includeImageAltText: true,
    }),
  }));

  const contextIssues: ContextIssue[] = [...(options.initialIssues ?? [])];
  const incomingAttachmentsPromise = collectIncomingAttachmentContext({
    emailAccountId: emailAccount.id,
    emailProvider,
    message: lastMessage,
    logger,
  });
  // 1. Get knowledge base entries
  const knowledgeBase = await optionalReplyContext(
    "知识库",
    async () =>
      prisma.knowledge.findMany({
        where: { emailAccountId: emailAccount.id },
        orderBy: { updatedAt: "desc" },
      }),
    [],
    contextIssues,
    logger,
  );

  // If we have knowledge base entries, extract relevant knowledge and draft with it
  // 2a. Extract relevant knowledge
  const lastMessageContent = stringifyEmail(
    messages[messages.length - 1],
    10_000,
  );
  const currentMessageIds = new Set(threadMessages.map((msg) => msg.id));
  const historicalMessagesForLLM = previousConversationMessages
    ?.filter((msg) => !currentMessageIds.has(msg.id))
    .map((msg) => ({
      ...getEmailForLLM(msg, {
        maxLength: 1000,
        extractReply: true,
        removeForwarded: false,
        includeLinkUrls: true,
        includeImageAltText: true,
      }),
      threadId: msg.threadId,
    }));
  const senderEmail = extractEmailAddress(lastMessage.headers.from);

  if (historicalMessagesForLLM?.length) {
    logger.info("Fetching historical messages from sender");
    logger.trace("Fetching historical messages from sender", {
      sender: lastMessage.headers.from,
    });
  }
  const attachmentSelectionPromise =
    selectedRuleId || options.bypassCache
      ? selectDraftAttachmentsForRule({
          emailAccount,
          ruleId: selectedRuleId,
          emailContent: lastMessageContent,
          logger,
        }).catch((error) => {
          contextIssues.push({
            source: "回复附件",
            message: "附件选择暂时不可用，请在发送前检查所需附件。",
          });
          logger.error("Failed to select draft attachments", {
            error,
            ruleId: selectedRuleId,
          });
          return {
            selectedAttachments: [],
            attachmentContext: null,
          };
        })
      : Promise.resolve({
          selectedAttachments: [],
          attachmentContext: null,
        });
  const activeBookingLinksPromise = optionalReplyContext(
    "预约链接",
    async () =>
      prisma.bookingLink.findMany({
        where: { emailAccountId: emailAccount.id, isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { slug: true, minimumNoticeMinutes: true },
      }),
    [],
    contextIssues,
    logger,
  );
  const calendarAvailabilityPromise = activeBookingLinksPromise.then(
    (activeBookingLinks) =>
      aiGetCalendarAvailability({
        onError: () =>
          contextIssues.push({
            source: "日历",
            message: "日历查询失败，无法判断空闲时间。请重新查询后再约定时间。",
          }),
        emailAccount,
        messages,
        logger,
        bookingLinkAvailable:
          activeBookingLinks.length > 0 || !!emailAccount.calendarBookingLink,
        minimumNoticeMinutes:
          activeBookingLinks[0]?.minimumNoticeMinutes ?? undefined,
      }),
  );
  // Other To/CC recipients, used for privacy filtering of meeting context:
  // only meetings where ALL recipients were attendees are included.
  const additionalRecipients = [
    ...extractEmailAddresses(lastMessage.headers.to),
    ...extractEmailAddresses(lastMessage.headers.cc ?? ""),
  ].filter((email) => email.toLowerCase() !== emailAccount.email.toLowerCase());
  const [
    knowledgeResult,
    replyMemorySelection,
    emailHistoryContext,
    calendarAvailability,
    writingStyle,
    emailAccountSettings,
    upcomingMeetings,
    recordedMeetings,
    emailHistorySummary,
    attachmentSelection,
    activeBookingLinks,
    senderReplyExamples,
  ] = await Promise.all([
    optionalReplyContext(
      "知识库",
      async () =>
        aiExtractRelevantKnowledge({
          onError: () => {
            if (!contextIssues.some((issue) => issue.source === "知识库"))
              contextIssues.push({
                source: "知识库",
                message: "知识库暂时无法查询，请核对相关事实。",
              });
          },
          knowledgeBase,
          emailContent: lastMessageContent,
          emailAccount,
          logger,
        }),
      null,
      contextIssues,
      logger,
    ),
    optionalReplyContext(
      "回复经验",
      async () =>
        getReplyMemoriesForPrompt({
          onError: () => {
            if (!contextIssues.some((issue) => issue.source === "回复经验"))
              contextIssues.push({
                source: "回复经验",
                message: "回复经验暂时无法查询，请核对相关事实。",
              });
          },
          emailAccount,
          senderEmail,
          emailContent: lastMessageContent,
          logger,
        }),
      { content: null, selectedMemories: [] },
      contextIssues,
      logger,
    ),
    optionalReplyContext(
      "历史邮件",
      async () =>
        aiCollectReplyContext({
          onError: () => {
            if (!contextIssues.some((issue) => issue.source === "历史邮件"))
              contextIssues.push({
                source: "历史邮件",
                message: "历史邮件暂时无法查询，请核对相关事实。",
              });
          },
          currentThread: messages,
          emailAccount,
          emailProvider,
        }),
      null,
      contextIssues,
      logger,
    ),
    optionalReplyContext(
      "日历",
      async () => calendarAvailabilityPromise,
      null,
      contextIssues,
      logger,
    ),
    optionalReplyContext(
      "写作偏好",
      async () => getWritingStyle({ emailAccountId: emailAccount.id }),
      null,
      contextIssues,
      logger,
    ),
    optionalReplyContext(
      "账户偏好",
      async () =>
        prisma.emailAccount.findUnique({
          where: { id: emailAccount.id },
          select: { learnedWritingStyle: true, signature: true },
        }),
      null,
      contextIssues,
      logger,
    ),
    optionalReplyContext(
      "日历会议",
      async () =>
        getMeetingContext({
          onError: () => {
            if (!contextIssues.some((issue) => issue.source === "日历会议"))
              contextIssues.push({
                source: "日历会议",
                message: "日历会议暂时无法查询，请核对相关事实。",
              });
          },
          emailAccountId: emailAccount.id,
          recipientEmail: senderEmail,
          additionalRecipients,
          logger,
        }),
      [],
      contextIssues,
      logger,
    ),
    optionalReplyContext(
      "会议记录",
      async () =>
        getRecordedMeetingContext({
          onError: () => {
            if (!contextIssues.some((issue) => issue.source === "会议记录"))
              contextIssues.push({
                source: "会议记录",
                message: "会议记录暂时无法查询，请核对相关事实。",
              });
          },
          emailAccountId: emailAccount.id,
          recipientEmail: senderEmail,
          additionalRecipients,
          logger,
        }),
      [],
      contextIssues,
      logger,
    ),
    optionalReplyContext(
      "历史摘要",
      async () =>
        historicalMessagesForLLM?.length
          ? aiExtractFromEmailHistory({
              currentThreadMessages: messages,
              historicalMessages: historicalMessagesForLLM,
              emailAccount,
              logger,
            })
          : Promise.resolve(null),
      null,
      contextIssues,
      logger,
    ),
    optionalReplyContext(
      "回复附件",
      async () => attachmentSelectionPromise,
      { selectedAttachments: [], attachmentContext: null },
      contextIssues,
      logger,
    ),
    optionalReplyContext(
      "预约链接",
      async () => activeBookingLinksPromise,
      [],
      contextIssues,
      logger,
    ),
    optionalReplyContext(
      "历史回复示例",
      async () =>
        collectSenderReplyExamples({
          onError: () =>
            contextIssues.push({
              source: "历史回复示例",
              message: "历史回复示例查询失败，请核对个人表达与相关事实。",
            }),
          emailAccount,
          emailProvider,
          senderEmail,
          currentMessageIds,
          logger,
        }),
      null,
      contextIssues,
      logger,
    ),
  ]);
  const {
    content: replyMemoryContent,
    selectedMemories: selectedReplyMemories,
  } = replyMemorySelection;
  const meetingContext = formatMeetingContextForPrompt(
    upcomingMeetings,
    emailAccount.timezone,
  );
  const recordedMeetingContext = formatRecordedMeetingContextForPrompt(
    recordedMeetings,
    emailAccount.timezone,
  );
  const precedentThreadCount = emailHistoryContext?.relevantEmails.length ?? 0;
  const draftContextMetadata: DraftContextMetadata = {
    aiRunId: randomUUID(),
    messageId: lastMessage.id,
    threadId: lastMessage.threadId,
    observedAt: new Date().toISOString(),
    replyMemories: {
      count: selectedReplyMemories.length,
      ids: selectedReplyMemories.map((m) => m.id),
      kinds: [...new Set(selectedReplyMemories.map((m) => m.kind))],
      scopeTypes: [...new Set(selectedReplyMemories.map((m) => m.scopeType))],
    },
    knowledgeBase: {
      availableCount: knowledgeBase.length,
      injected: !!knowledgeResult?.relevantContent?.trim(),
    },
    senderHistory: {
      summaryInjected: !!emailHistorySummary,
      summarySourceMessageCount: historicalMessagesForLLM?.length ?? 0,
      precedentThreadsInjected: precedentThreadCount > 0,
      precedentThreadCount,
      sameSenderReplyExamplesInjected: !!senderReplyExamples?.content,
      sameSenderReplyExampleCount: senderReplyExamples?.count ?? 0,
    },
    calendar: {
      injected: !!calendarAvailability,
      noAvailability: calendarAvailability?.noAvailability ?? false,
      suggestedTimesCount: calendarAvailability?.suggestedTimes?.length ?? 0,
    },
    writingStyle: { custom: !!writingStyle },
    externalTools: { injected: false },
    meetings: { injected: !!meetingContext, count: upcomingMeetings.length },
    recordedMeetings: {
      injected: !!recordedMeetingContext,
      count: recordedMeetings.length,
    },
    attachments: {
      injected: !!attachmentSelection.attachmentContext,
      selectedCount: attachmentSelection.selectedAttachments.length,
    },
  };

  if (selectedReplyMemories.length) {
    logger.info("Injecting reply memories into draft prompt", {
      replyMemoryCount: selectedReplyMemories.length,
      replyMemoryIds: selectedReplyMemories.map((memory) => memory.id),
      replyMemoryKinds: [
        ...new Set(selectedReplyMemories.map((memory) => memory.kind)),
      ],
      replyMemoryScopeTypes: [
        ...new Set(selectedReplyMemories.map((memory) => memory.scopeType)),
      ],
    });
  }

  const incomingAttachments = await incomingAttachmentsPromise;
  contextIssues.push(...incomingAttachments.issues);
  const attachmentContext =
    [incomingAttachments.content, attachmentSelection.attachmentContext]
      .filter(Boolean)
      .join("\n\n") || null;
  draftContextMetadata.attachments.injected = Boolean(attachmentContext);
  // 3. Draft reply
  const { reply, confidence, attribution, missingInformation } =
    await aiDraftReplyWithConfidence({
      replyInstructions: options.replyInstructions,
      unavailableContext: contextIssues.map(
        (issue) => `${issue.source}：${issue.message}`,
      ),
      messages,
      emailAccount: { ...emailAccount, bookingLinks: activeBookingLinks },
      knowledgeBaseContent: knowledgeResult?.relevantContent || null,
      replyMemoryContent,
      emailHistorySummary,
      emailHistoryContext,
      senderReplyExamples: senderReplyExamples?.content ?? null,
      calendarAvailability,
      writingStyle,
      learnedWritingStyle: emailAccountSettings?.learnedWritingStyle ?? null,
      hasConfiguredSignature: !!emailAccountSettings?.signature?.trim(),
      mcpContext: null,
      meetingContext,
      recordedMeetingContext,
      attachmentContext: attachmentSelection.attachmentContext,
      incomingAttachmentContext: incomingAttachments.content,
    });

  const meetsThreshold = meetsDraftReplyConfidenceRequirement({
    draftConfidence: confidence,
    minimumConfidence,
  });
  draftContextMetadata.draft = { confidence };
  draftContextMetadata.missingInformation = missingInformation ?? [];
  draftContextMetadata.issues = contextIssues;
  draftContextMetadata.sources = buildDraftSources({
    emailAccountId: emailAccount.id,
    messages,
    knowledge: resolveKnowledgeSources({
      emailAccountId: emailAccount.id,
      knowledge: knowledgeBase,
      citations: knowledgeResult?.sources ?? [],
    }),
    memories: selectedReplyMemories,
    history: [
      ...(emailHistoryContext?.sources ?? []),
      ...(senderReplyExamples?.sources ?? []),
    ],
    historicalSummary: {
      messages: historicalMessagesForLLM ?? [],
      text: emailHistorySummary,
    },
    calendar: calendarAvailability
      ? {
          messageId: lastMessage.id,
          text: [
            calendarAvailability.noAvailability
              ? "查询范围内没有可用时间"
              : "建议时间",
            ...calendarAvailability.suggestedTimes.map(
              (time) => `${time.start} 至 ${time.end}`,
            ),
            ...(calendarAvailability.queriedRanges ?? []).map(
              (range) =>
                `查询范围：${range.start} 至 ${range.end}；查询时间：${range.observedAt}`,
            ),
            `时区：${calendarAvailability.timezone ?? emailAccount.timezone ?? "UTC"}`,
          ].join("\n"),
        }
      : null,
    meetings: [
      ...upcomingMeetings.map((meeting) => ({
        id: meeting.eventId,
        title: meeting.eventTitle,
        excerpt:
          formatMeetingContextForPrompt([meeting], emailAccount.timezone) ?? "",
        date: meeting.eventTime,
        href: meeting.eventUrl,
      })),
      ...recordedMeetings.map((meeting) => ({
        id: meeting.id,
        href: meeting.id
          ? `/${emailAccount.id}/meetings?meeting-id=${encodeURIComponent(meeting.id)}`
          : undefined,
        title: meeting.eventTitle,
        excerpt:
          formatRecordedMeetingContextForPrompt(
            [meeting],
            emailAccount.timezone,
          ) ?? "",
        date: meeting.startTime,
      })),
    ],
    attachments: attachmentSelection.selectedAttachments,
    incomingAttachments: incomingAttachments.sources,
    writingStyle:
      [
        writingStyle,
        emailAccountSettings?.learnedWritingStyle,
        emailAccount.about,
      ]
        .filter(Boolean)
        .join("\n\n") || null,
  });
  if (
    emailHistoryContext?.relevantEmails.length &&
    !emailHistoryContext.sources?.length
  ) {
    contextIssues.push({
      source: "历史邮件",
      message: "检索未返回可定位的邮件来源，请核对相关事实。",
    });
  }

  if (!meetsThreshold) {
    // A suppressed draft creates no action and therefore no ExecutedAction row.
    logger.info("Skipping draft due to low confidence", {
      emailAccountId: emailAccount.id,
      draftConfidence: confidence,
      minimumConfidence,
      threadId: lastMessage.threadId,
      messageId: lastMessage.id,
    });

    try {
      if (!options.replyInstructions?.trim())
        await saveReply({
          emailAccountId: emailAccount.id,
          messageId: lastMessage.id,
          reply,
          confidence,
          attribution,
          draftContextMetadata,
          ...(selectedRuleId
            ? {
                attachments: attachmentSelection.selectedAttachments,
                ruleId: selectedRuleId,
              }
            : {}),
        });
    } catch (error) {
      logger.error("Failed to cache low-confidence draft", {
        error,
        messageId: lastMessage.id,
        confidence,
      });
    }

    return {
      draft: null,
      confidence,
      attribution,
      draftContextMetadata,
      ...(attachmentSelection.selectedAttachments.length
        ? { attachments: attachmentSelection.selectedAttachments }
        : {}),
    };
  }

  try {
    if (!options.replyInstructions?.trim())
      await saveReply({
        emailAccountId: emailAccount.id,
        messageId: lastMessage.id,
        reply,
        confidence,
        attribution,
        draftContextMetadata,
        ...(selectedRuleId
          ? {
              attachments: attachmentSelection.selectedAttachments,
              ruleId: selectedRuleId,
            }
          : {}),
      });
  } catch (error) {
    logger.error("Failed to cache draft", {
      error,
      messageId: lastMessage.id,
      confidence,
    });
  }

  return {
    draft: reply,
    confidence,
    attribution,
    draftContextMetadata,
    ...(attachmentSelection.selectedAttachments.length
      ? { attachments: attachmentSelection.selectedAttachments }
      : {}),
  };
}

async function optionalReplyContext<T>(
  source: string,
  task: () => Promise<T>,
  fallback: T,
  issues: ContextIssue[],
  logger: Logger,
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    logger.warn("Reply context source unavailable", { source, error });
    if (!issues.some((issue) => issue.source === source))
      issues.push({
        source,
        message: `${source}暂时无法查询，请核对涉及这部分资料的事实。`,
      });
    return fallback;
  }
}
