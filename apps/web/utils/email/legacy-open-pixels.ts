export function isSentMessageOpenPixelUrl(url: string) {
  try {
    return /^\/t\/[A-Za-z0-9_-]{32}$/.test(
      new URL(url, "https://example.invalid").pathname,
    );
  } catch {
    return false;
  }
}
export function stripSentMessageOpenPixels(html: string) {
  if (!html) return html;
  return html.replace(/<img\b[^>]*\/?>/gi, (tag) => {
    const src = getImgSrc(tag);
    if (!src) return tag;
    return isSentMessageOpenPixelUrl(src.replace(/&amp;/g, "&")) ? "" : tag;
  });
}

function getImgSrc(tag: string) {
  const quoted = tag.match(/\bsrc\s*=\s*(["'])([^"']*)\1/i)?.[2];
  if (quoted !== undefined) return quoted;
  return tag.match(/\bsrc\s*=\s*([^\s>]+)/i)?.[1];
}
