import { readFileSync, writeFileSync } from "node:fs";

const filename = process.argv[2];
const seed = JSON.parse(readFileSync(filename, "utf8"));
seed.microsoft.messages = Array.from({ length: 65 }, (_, index) => ({
  id: `outlook-message-${index}`,
  conversation_id: `outlook-thread-${index}`,
  user_email: "developer@outlook.test",
  from: { address: "teammate@example.com", name: "测试同事" },
  to_recipients: [{ address: "developer@outlook.test" }],
  subject: index === 0 ? "请审批第二季度经营数据" : `Outlook 测试邮件 ${index}`,
  body_content: "<p>用于验证邮件服务接口的模拟测试邮件。</p>",
  body_content_type: "html",
  parent_folder_id: "inbox",
  is_read: index % 2 === 0,
  is_draft: false,
  inference_classification: "focused",
  received_date_time: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
}));
writeFileSync(filename, `${JSON.stringify(seed, null, 2)}\n`);
