/**
 * RSR Nexora - Live System Clock & Time Intelligence Service
 * Provides server-authoritative, real-time clock data and IANA timezone calculations.
 * Never uses static or hardcoded time values.
 */

export interface TimeContext {
  iso: string;
  unixTimestampMs: number;
  formattedUtc: string;
  localTime: string;
  localDate: string;
  dayOfWeek: string;
  timezone: string;
  utcOffset: string;
  worldReferenceTimes: Record<string, string>;
}

export class TimeService {
  /**
   * Get formatted time string in a specific IANA timezone.
   */
  public static formatTimeInZone(date: Date, timeZone: string): string {
    try {
      return date.toLocaleTimeString("en-US", {
        timeZone,
        hour12: true,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return date.toLocaleTimeString("en-US", {
        timeZone: "UTC",
        hour12: true,
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }

  /**
   * Get formatted full date in a specific IANA timezone.
   */
  public static formatDateInZone(date: Date, timeZone: string): string {
    try {
      return date.toLocaleDateString("en-US", {
        timeZone,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return date.toLocaleDateString("en-US", {
        timeZone: "UTC",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  }

  /**
   * Resolve a safe IANA timezone, falling back to Asia/Kolkata or UTC.
   */
  public static sanitizeTimezone(tz?: string): string {
    if (!tz || typeof tz !== "string") {
      return "Asia/Kolkata";
    }
    const cleanTz = tz.trim();
    try {
      // Validate that Intl accepts this timezone
      Intl.DateTimeFormat(undefined, { timeZone: cleanTz });
      return cleanTz;
    } catch {
      return "Asia/Kolkata";
    }
  }

  /**
   * Build comprehensive live time context for the AI prompt.
   */
  public static getTimeContext(requestedTimezone?: string): TimeContext {
    const now = new Date();
    const tz = this.sanitizeTimezone(requestedTimezone);

    // Compute UTC offset string for the target timezone
    let utcOffset = "+00:00";
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "shortOffset",
      }).formatToParts(now);
      const tzPart = parts.find((p) => p.type === "timeZoneName");
      if (tzPart) {
        utcOffset = tzPart.value;
      }
    } catch {
      utcOffset = "+05:30";
    }

    const worldReferenceZones = [
      { city: "New Delhi / Mumbai (IST)", tz: "Asia/Kolkata" },
      { city: "London (GMT/BST)", tz: "Europe/London" },
      { city: "New York (EST/EDT)", tz: "America/New_York" },
      { city: "San Francisco (PST/PDT)", tz: "America/Los_Angeles" },
      { city: "Dubai (GST)", tz: "Asia/Dubai" },
      { city: "Singapore (SGT)", tz: "Asia/Singapore" },
      { city: "Tokyo (JST)", tz: "Asia/Tokyo" },
      { city: "Sydney (AEST/AEDT)", tz: "Australia/Sydney" },
    ];

    const worldReferenceTimes: Record<string, string> = {};
    for (const ref of worldReferenceZones) {
      worldReferenceTimes[ref.city] = `${this.formatDateInZone(now, ref.tz)} ${this.formatTimeInZone(now, ref.tz)}`;
    }

    return {
      iso: now.toISOString(),
      unixTimestampMs: now.getTime(),
      formattedUtc: `${this.formatDateInZone(now, "UTC")} ${this.formatTimeInZone(now, "UTC")} UTC`,
      localTime: this.formatTimeInZone(now, tz),
      localDate: this.formatDateInZone(now, tz),
      dayOfWeek: now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" }),
      timezone: tz,
      utcOffset,
      worldReferenceTimes,
    };
  }

  /**
   * Generates a prompt block that gives the model ground truth for date and time.
   */
  public static generatePromptContext(requestedTimezone?: string): string {
    const ctx = this.getTimeContext(requestedTimezone);

    const worldRefLines = Object.entries(ctx.worldReferenceTimes)
      .map(([city, timeStr]) => `  - ${city}: ${timeStr}`)
      .join("\n");

    return `
[LIVE SYSTEM CLOCK & REAL-TIME GROUND TRUTH]:
- Server Clock (UTC): ${ctx.formattedUtc}
- ISO Timestamp: ${ctx.iso}
- User Local Timezone: ${ctx.timezone} (${ctx.utcOffset})
- User Current Date: ${ctx.localDate}
- User Current Time: ${ctx.localTime}
- User Day of Week: ${ctx.dayOfWeek}
- Major Global Reference Times:
${worldRefLines}

DIRECTIVE FOR TIME & DATE QUESTIONS:
1. When asked "What time is it?", "What is today's date?", "What day is today?", or similar:
   - State the current time/date accurately based on the User Local Time (${ctx.localTime}, ${ctx.localDate}) unless a specific timezone or city is requested.
2. For questions regarding another city or country, calculate accurately using the real-time clock data above or IANA timezone standards.
3. For date calculations (e.g. "How many days until...?", "What was the date 10 days ago?"), calculate strictly relative to today's date: ${ctx.localDate}.
4. NEVER use stale or hardcoded training dates. NEVER tell the user you don't know the current time or date.
`.trim();
  }
}
