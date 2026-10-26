import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const allocatedPorts = new Set();
const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
if (production && !process.env.NEXT_PUBLIC_BASE_URL) {
  throw new Error(
    "Production Playwright requires NEXT_PUBLIC_BASE_URL to match the URL used for next build.",
  );
}
const baseURL =
  process.env.NEXT_PUBLIC_BASE_URL ??
  `http://localhost:${await getAvailablePort()}`;
const basePort = getUrlPort(baseURL);
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/postgres";
const mailProvider =
  process.env.PLAYWRIGHT_MAIL_PROVIDER === "microsoft" ? "microsoft" : "google";
const emulateBaseUrl =
  (mailProvider === "microsoft"
    ? process.env.MICROSOFT_BASE_URL
    : process.env.GOOGLE_BASE_URL) ??
  `http://localhost:${await getAvailablePort()}`;
const emulatePort = getUrlPort(emulateBaseUrl);
const microsoftClientId =
  process.env.MICROSOFT_CLIENT_ID ?? "emulate-microsoft-client-id";
const microsoftClientSecret =
  process.env.MICROSOFT_CLIENT_SECRET ?? "emulate-microsoft-secret";
const microsoftWebhookClientState =
  process.env.MICROSOFT_WEBHOOK_CLIENT_STATE ?? "playwright-microsoft-webhook";
const emailBaseUrl =
  process.env.PLAYWRIGHT_EMAIL_BASE_URL ??
  `http://127.0.0.1:${await getAvailablePort()}`;
const emailPort = getUrlPort(emailBaseUrl);
process.env.PLAYWRIGHT_EMAIL_BASE_URL = emailBaseUrl;

// Set PLAYWRIGHT_LLM_BASE_URL to run against an external OpenAI-compatible
// server (serving a model named `emulated`) instead of the in-repo emulator.
const externalLlmBaseUrl = process.env.PLAYWRIGHT_LLM_BASE_URL;
const llmBaseUrl =
  externalLlmBaseUrl ?? `http://127.0.0.1:${await getAvailablePort()}`;
const llmPort = getUrlPort(llmBaseUrl);
const llmModelName = "emulated";

// The emulator accepts any price id; these only have to match what the app was
// built with so the tier lookup resolves.

const internalApiKey = process.env.INTERNAL_API_KEY ?? "secret";
const nodeOptions = process.env.NODE_OPTIONS ?? "--max_old_space_size=6144";
const runId = process.env.PLAYWRIGHT_RUN_ID ?? `${process.pid}-${Date.now()}`;
const playwrightTestEmail =
  process.env.PLAYWRIGHT_TEST_EMAIL ??
  `playwright-test+${runId}@gmail.com`.toLowerCase();
const blobReportFile = process.env.PLAYWRIGHT_BLOB_REPORT_FILE;
const authStatePath = path.join(
  process.cwd(),
  ".tmp",
  "playwright",
  runId,
  "auth.json",
);
const emulateSeedPath = writeEmulateSeed({
  baseURL,
  mailProvider,
  playwrightTestEmail,
  runId,
});
const emulateCommand =
  process.env.EMULATE_COMMAND ??
  `node scripts/emulator/provider.mjs ${mailProvider} ${emulatePort} ${emulateSeedPath}`;

fs.mkdirSync(path.dirname(authStatePath), { recursive: true });
process.env.DATABASE_URL = databaseUrl;
if (mailProvider === "microsoft") {
  process.env.MICROSOFT_BASE_URL = emulateBaseUrl;
  process.env.MICROSOFT_CLIENT_ID = microsoftClientId;
  process.env.MICROSOFT_CLIENT_SECRET = microsoftClientSecret;
  process.env.MICROSOFT_WEBHOOK_CLIENT_STATE = microsoftWebhookClientState;
} else {
  process.env.GOOGLE_BASE_URL = emulateBaseUrl;
}
process.env.INTERNAL_API_KEY = internalApiKey;
process.env.NEXT_PUBLIC_BASE_URL = baseURL;
process.env.NODE_OPTIONS = nodeOptions;
process.env.PLAYWRIGHT_AUTH_FILE = authStatePath;
process.env.PLAYWRIGHT_RUN_ID = runId;
process.env.PLAYWRIGHT_TEST_EMAIL = playwrightTestEmail;
process.env.PLAYWRIGHT_MAIL_PROVIDER = mailProvider;

process.env.PLAYWRIGHT_LLM_BASE_URL = llmBaseUrl;
// Only a default. Production runs freeze NEXT_PUBLIC_* into the build, which
// happens in a separate job before this config loads, so those runs must set
// these in the workflow and have their values win here.

export default defineConfig({
  testDir: "./__tests__/playwright",
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR,
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  // Every browser test shares one seeded provider and one authenticated account.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 240_000,
  expect: {
    timeout: 20_000,
  },
  reporter: blobReportFile
    ? [
        ...(process.env.CI ? [["github"]] : []),
        ["list"],
        ["blob", { outputFile: blobReportFile }],
      ]
    : [
        ...(process.env.CI ? [["github"]] : []),
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ],
  use: {
    baseURL,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "emulated-setup",
      testMatch: ["emulated/setup/**/*.setup.ts"],
    },
    {
      name: "emulated",
      dependencies: ["emulated-setup"],
      testMatch: ["emulated/**/*.spec.ts"],
      use: {
        storageState: authStatePath,
      },
    },
  ],
  webServer: [
    {
      name: "Email emulator",
      stdout: "pipe",
      command: `node __tests__/playwright/email-server.mjs ${emailPort}`,
      cwd: process.cwd(),
      url: emailBaseUrl,
      timeout: 30_000,
    },
    {
      name:
        mailProvider === "microsoft" ? "Microsoft emulator" : "Google emulator",
      stdout: "pipe",
      command: emulateCommand,
      cwd: process.cwd(),
      url: `${emulateBaseUrl}/.well-known/openid-configuration`,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
    },

    ...(externalLlmBaseUrl
      ? []
      : [
          {
            name: "LLM emulator",
            stdout: "pipe",
            command: `pnpm exec tsx scripts/run-llm-emulator.ts ${llmPort}`,
            cwd: process.cwd(),
            url: `${llmBaseUrl}/health`,
            timeout: 60_000,
            reuseExistingServer: false,
            env: { ...process.env, LLM_EMULATOR_MODEL: llmModelName },
          },
        ]),
    {
      name: "Next.js",
      stdout: "pipe",
      command: `pnpm exec next ${production ? "start" : "dev --turbopack"} --port ${basePort}`,
      cwd: process.cwd(),
      url: `${baseURL}/api/auth/ok`,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,

        NODE_ENV: production ? "production" : "development",
        NODE_OPTIONS: nodeOptions,
        NEXT_PUBLIC_BASE_URL: baseURL,
        // Legacy suites exercise the reusable upstream modules; the course command opts in.

        NEXT_PUBLIC_MAIL_ENGINE_TEST_INSPECT: "true",
        DATABASE_URL: databaseUrl,
        PREVIEW_DATABASE_URL: databaseUrl,
        AUTH_SECRET: process.env.AUTH_SECRET ?? "secret",
        ...(process.env.PLAYWRIGHT_SCIM_TEST === "true" && {
          ADMINS: playwrightTestEmail,
        }),
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "client_id",
        GOOGLE_CLIENT_SECRET:
          process.env.GOOGLE_CLIENT_SECRET ?? "client_secret",
        ...(mailProvider === "microsoft"
          ? {
              MICROSOFT_BASE_URL: emulateBaseUrl,
              MICROSOFT_CLIENT_ID: microsoftClientId,
              MICROSOFT_CLIENT_SECRET: microsoftClientSecret,
              MICROSOFT_WEBHOOK_CLIENT_STATE: microsoftWebhookClientState,
            }
          : { GOOGLE_BASE_URL: emulateBaseUrl }),
        GOOGLE_PUBSUB_TOPIC_NAME:
          process.env.GOOGLE_PUBSUB_TOPIC_NAME ?? "topic",
        GOOGLE_PUBSUB_VERIFICATION_TOKEN:
          process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN ?? "playwright-token",
        EMAIL_ENCRYPT_SECRET: process.env.EMAIL_ENCRYPT_SECRET ?? "secret",
        EMAIL_ENCRYPT_SALT: process.env.EMAIL_ENCRYPT_SALT ?? "salt",
        API_KEY_SALT: process.env.API_KEY_SALT ?? "playwright-api-key-salt",
        INTERNAL_API_KEY: internalApiKey,
        // Every model role resolves to the emulator so no spec depends on a
        // live provider.
        DEFAULT_LLMS: `openai-compatible:${llmModelName}`,
        MAIL_TRIAGE_API_KEY: "playwright-only-key",
        MAIL_TRIAGE_BASE_URL: llmBaseUrl,
        MAIL_TRIAGE_MODEL: llmModelName,
        ECONOMY_LLMS: "",
        CHAT_LLMS: "",
        NANO_LLMS: "",
        DRAFT_LLMS: "",
        OPENAI_COMPATIBLE_BASE_URL: `${llmBaseUrl}/v1`,
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENROUTER_API_KEY: "",
        AI_GATEWAY_API_KEY: "",
        REDIS_HTTP_URL:
          process.env.REDIS_HTTP_URL || process.env.UPSTASH_REDIS_URL || "",
        REDIS_HTTP_TOKEN:
          process.env.REDIS_HTTP_TOKEN || process.env.UPSTASH_REDIS_TOKEN || "",
        QSTASH_TOKEN: "",
        QSTASH_CURRENT_SIGNING_KEY: "",
        QSTASH_NEXT_SIGNING_KEY: "",
        RESEND_API_KEY: "playwright-email-key",
        RESEND_BASE_URL: emailBaseUrl,
        RESEND_AUDIENCE_ID: "playwright-audience",
        RESEND_FROM_EMAIL: "十组邮件小助手 <signin@example.com>",

        FB_CONVERSION_API_ACCESS_TOKEN: "",
        FB_PIXEL_ID: "",
        CONVERSION_ANALYTICS_SERVER_URL: "",
        CONVERSION_ANALYTICS_SERVER_SECRET: "",

        NEXT_PUBLIC_IS_RESEND_CONFIGURED: "",
        NEXT_PUBLIC_CONTACTS_ENABLED:
          process.env.NEXT_PUBLIC_CONTACTS_ENABLED ?? "true",
        NEXT_PUBLIC_EMAIL_SEND_ENABLED: "true",
        NEXT_PUBLIC_MEETING_RECORDER_ENABLED: "true",

        PLAYWRIGHT_TEST_EMAIL: playwrightTestEmail,
      },
    },
  ],
});

function writeEmulateSeed({
  baseURL,
  mailProvider,
  playwrightTestEmail,
  runId,
}) {
  const isMicrosoft = mailProvider === "microsoft";
  const templatePath = path.join(
    process.cwd(),
    isMicrosoft
      ? "emulate.playwright.microsoft.yaml"
      : "emulate.playwright.config.yaml",
  );
  const outputDir = path.join(process.cwd(), ".tmp", "playwright", runId);
  const outputPath = path.join(outputDir, "emulate.playwright.generated.yaml");
  const redirectUri = new URL(
    isMicrosoft ? "/api/auth/callback/microsoft" : "/api/auth/callback/google",
    baseURL,
  ).href;
  const linkingUri = new URL(
    isMicrosoft
      ? "/api/outlook/linking/callback"
      : "/api/google/linking/callback",
    baseURL,
  ).href;
  const meetingStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const meetingEnd = new Date(meetingStart.getTime() + 30 * 60 * 1000);
  const profileImage = fs.readFileSync(
    path.join(process.cwd(), "public/splash_screens/icon.png"),
  );

  fs.mkdirSync(outputDir, { recursive: true });

  let seed = fs
    .readFileSync(templatePath, "utf8")
    .replaceAll("__PLAYWRIGHT_TEST_EMAIL__", playwrightTestEmail)
    .replaceAll(
      "__PLAYWRIGHT_TEAM_B_EMAIL__",
      teammateEmail(playwrightTestEmail, "b"),
    )
    .replaceAll(
      "__PLAYWRIGHT_TEAM_C_EMAIL__",
      teammateEmail(playwrightTestEmail, "c"),
    )
    .replaceAll(
      "__PLAYWRIGHT_TEAM_D_EMAIL__",
      teammateEmail(playwrightTestEmail, "d"),
    )
    .replaceAll("__PLAYWRIGHT_TEST_REDIRECT_URI__", redirectUri)
    .replaceAll("__PLAYWRIGHT_TEST_LINKING_URI__", linkingUri)
    .replaceAll("__PLAYWRIGHT_MEETING_START__", meetingStart.toISOString())
    .replaceAll("__PLAYWRIGHT_MEETING_END__", meetingEnd.toISOString())
    .replaceAll(
      "__PLAYWRIGHT_PROFILE_PICTURE__",
      `data:image/png;base64,${profileImage.toString("base64")}`,
    )
    .replaceAll(
      "__PLAYWRIGHT_READER_VISUAL_RAW__",
      createReaderVisualMessage({
        attachment: profileImage,
        recipient: playwrightTestEmail,
      }),
    )
    .replaceAll(
      "__PLAYWRIGHT_CALENDAR_INVITE_RAW__",
      createCalendarInviteMessage({
        recipient: playwrightTestEmail,
        start: meetingStart,
        end: meetingEnd,
      }),
    )
    .replaceAll("__PLAYWRIGHT_LONG_LINK__", createOverflowLongLink())
    .replaceAll(
      "__PLAYWRIGHT_DESIGNED_HTML__",
      JSON.stringify(createDesignedThemeHtml()).slice(1, -1),
    );

  // Mailbox synchronization only covers recent mail. Preserve the fixture's
  // ordering without letting fixed seed dates age out of that window.
  seed = isMicrosoft
    ? refreshMicrosoftMessageDates(seed)
    : refreshGmailMessageDates(seed);

  fs.writeFileSync(outputPath, seed);

  return outputPath;
}

// Keep in sync with teammateEmail in team-comments-test-helpers.ts. The role
// goes at the end of the local part so the publisher's address is never a
// substring of a teammate's, which the OAuth account picker matches on.
function teammateEmail(publisherEmail, role) {
  const at = publisherEmail.lastIndexOf("@");
  return `${publisherEmail.slice(0, at)}+team-${role}${publisherEmail.slice(at)}`;
}

function refreshGmailMessageDates(seed) {
  const messageDates = [
    ...new Set(
      [...seed.matchAll(/internal_date: "(\d+)"/g)].map((match) =>
        Number(match[1]),
      ),
    ),
  ].sort((left, right) => right - left);
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  return seed.replaceAll(/internal_date: "(\d+)"/g, (_, timestamp) => {
    const date =
      yesterday - messageDates.indexOf(Number(timestamp)) * 60 * 60 * 1000;
    return `internal_date: "${date}"`;
  });
}

function refreshMicrosoftMessageDates(seed) {
  const messageDates = [
    ...new Set(
      [...seed.matchAll(/received_date_time: "([^"]+)"/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort((left, right) => Date.parse(right) - Date.parse(left));
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  return seed.replaceAll(/received_date_time: "([^"]+)"/g, (_, timestamp) => {
    const date = new Date(
      yesterday - messageDates.indexOf(timestamp) * 60 * 60 * 1000,
    );
    return `received_date_time: "${date.toISOString()}"`;
  });
}

function createReaderVisualMessage({ attachment, recipient }) {
  const boundary = "playwright-reader-visual-boundary";
  const html = [
    '<!doctype html><html lang="zh-CN"><head><style>p { margin: 0 0 16px; }</style></head>',
    '<body style="margin: 0; padding: 16px; background: #232326; color: #f4e9da; font-family: Arial, sans-serif">',
    "<div><p>当前回复简洁明了，便于阅读。</p>",
    "<p>附件图片应在下方显示预览。</p></div>",
    '<div id="divRplyFwdMsg"><hr><div><b>From:</b> 上一位发件人</div></div>',
    "<div><p>较早的引用内容在展开前保持隐藏。</p></div>",
    "</body></html>",
  ].join("");
  const mime = [
    "From: 摩根 <morgan@example.com>",
    `To: ${recipient}`,
    "Subject: 回复：阅读器视觉测试邮件",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}`,
    'Content-Type: image/png; name="邮件图片.png"',
    'Content-Disposition: attachment; filename="邮件图片.png"',
    "Content-Transfer-Encoding: base64",
    "",
    attachment.toString("base64"),
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return Buffer.from(mime, "utf8").toString("base64url");
}

function createCalendarInviteMessage({ recipient, start, end }) {
  const boundary = "playwright-calendar-invite-boundary";
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//十组邮件小助手//Playwright//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    "UID:playwright-calendar-invite@example.com",
    "SUMMARY:项目规划",
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    "ORGANIZER:mailto:organizer@example.com",
    `ATTENDEE;PARTSTAT=ACCEPTED:mailto:${recipient}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const mime = [
    "From: 测试组织者 <organizer@example.com>",
    `To: ${recipient}`,
    "Subject: 日历邀请测试邮件",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    "请参加项目规划会议。",
    `--${boundary}`,
    'Content-Type: text/calendar; method=REQUEST; charset="UTF-8"',
    'Content-Disposition: attachment; filename="会议邀请.ics"',
    "",
    ics,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

function toIcsUtc(value) {
  return new Date(value)
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
}

function createOverflowLongLink() {
  return `https://example.com/account?reference=${"abcdef0123456789".repeat(24)}`;
}

function createDesignedThemeHtml() {
  return `<html><head><style>
          .card { background: #f8f9fa; color: #202124; }
          @media (prefers-color-scheme: dark) {
            .card { background: #202124 !important; color: #e8eaed !important; }
          }
        </style></head><body>
          <div class="card" style="background:#f8f9fa;color:#202124;font-family:Arial,sans-serif;font-size:16px">
            完成设置
          </div>
        </body></html>`;
}

function getUrlPort(url) {
  const parsed = new URL(url);
  if (parsed.port) return parsed.port;
  return parsed.protocol === "https:" ? "443" : "80";
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local Playwright port"));
        return;
      }
      server.close(() => {
        if (allocatedPorts.has(address.port)) {
          getAvailablePort().then(resolve, reject);
          return;
        }
        allocatedPorts.add(address.port);
        resolve(address.port);
      });
    });
  });
}
