// The Microsoft emulator adds these messages for every configured user before
// loading our seed. Use its Graph API so all startup and reset paths agree.
const microsoftDefaults = {
  welcome: [
    "欢迎使用 Outlook 测试邮箱",
    "本地 Microsoft 授权已就绪，可以测试邮件、日历和 OneDrive 功能。",
    "欢迎团队",
  ],
  planning: [
    "请提供明天的可用时间",
    "请发送明天下午方便开会的时间。我在协调世界时 13:00 或 16:00 有空。",
    "亚历克斯",
  ],
  sent: [
    "回复：夜间构建状态",
    "检查结果正常，我会在午饭后进行复核。",
    "测试用户",
  ],
  draft: ["跟进邮件草稿", "就待办事项发送一封简短的跟进邮件。", "测试用户"],
};

export async function localizeMicrosoftDemoMail(baseUrl, email, token) {
  const scoped = email.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const headers = {
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const categoriesUrl = `${baseUrl}/v1.0/me/outlook/masterCategories`;
  const categoriesResponse = await fetch(categoriesUrl, { headers });
  if (!categoriesResponse.ok)
    throw new Error(
      `Cannot read Microsoft demo categories: ${categoriesResponse.status}`,
    );
  const { value: categories } = await categoriesResponse.json();
  const followUp = categories.find(
    (category) => category.displayName === "Follow Up",
  );
  if (
    followUp &&
    !categories.some((category) => category.displayName === "待跟进")
  ) {
    const created = await fetch(categoriesUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ displayName: "待跟进", color: followUp.color }),
    });
    if (!created.ok)
      throw new Error(
        `Cannot localize Microsoft demo category: ${created.status}`,
      );
  }
  for (const [suffix, [subject, content, name]] of Object.entries(
    microsoftDefaults,
  )) {
    const url = `${baseUrl}/v1.0/me/messages/${scoped}_msg_${suffix}`;
    const existing = await fetch(url, { headers });
    if (existing.status === 404) continue;
    if (!existing.ok)
      throw new Error(`Cannot read Microsoft demo mail: ${existing.status}`);
    const message = await existing.json();
    const result = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        subject,
        body: { contentType: "html", content: `<p>${content}</p>` },
        from: { emailAddress: { ...message.from?.emailAddress, name } },
        categories: (message.categories ?? []).map((category) =>
          category === "Follow Up" ? "待跟进" : category,
        ),
        toRecipients: (message.toRecipients ?? []).map((recipient) => ({
          emailAddress: {
            ...recipient.emailAddress,
            name:
              suffix === "sent"
                ? "构建通知"
                : suffix === "draft"
                  ? "测试收件人"
                  : "测试用户",
          },
        })),
      }),
    });
    if (!result.ok)
      throw new Error(`Cannot localize Microsoft demo mail: ${result.status}`);
  }
  if (followUp) {
    const removed = await fetch(
      `${categoriesUrl}/${encodeURIComponent(followUp.id)}`,
      {
        method: "DELETE",
        headers,
      },
    );
    if (!removed.ok)
      throw new Error(
        `Cannot replace Microsoft demo category: ${removed.status}`,
      );
  }
}
