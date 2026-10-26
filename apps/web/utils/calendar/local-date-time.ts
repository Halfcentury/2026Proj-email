import { TZDate } from "@date-fns/tz";
import { isValidTimeZone } from "@inboxzero/scheduling";

export function localDateTimeToIso(value: string, timezone: string) {
  if (!isValidTimeZone(timezone)) throw new Error("请填写有效的 IANA 时区。");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("请填写完整日期和时间。");
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new TZDate(year, month - 1, day, hour, minute, 0, 0, timezone);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  )
    throw new Error("此时间在所选时区无效，请重新选择。");
  return new Date(date.getTime()).toISOString();
}
