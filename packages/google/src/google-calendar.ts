import { calendar as calendarApi, type calendar_v3 } from "@googleapis/calendar";
import type { OAuth2Client } from "google-auth-library";
import { withRetry } from "./limiter.js";
import type { CalendarBackend, CalendarEventInput } from "./types.js";

export class GoogleCalendar implements CalendarBackend {
  readonly kind = "google" as const;
  private readonly api: calendar_v3.Calendar;

  constructor(auth: OAuth2Client) {
    this.api = calendarApi({ version: "v3", auth });
  }

  async createDeadlineEvent(e: CalendarEventInput): Promise<string> {
    const end = new Date(`${e.date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const r = await withRetry(() =>
      this.api.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: e.title,
          description: e.description,
          start: { date: e.date },
          end: { date: end.toISOString().slice(0, 10) },
          transparency: "transparent",
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 7 * 24 * 60 },
              { method: "popup", minutes: 24 * 60 },
            ],
          },
        },
      }),
    );
    return r.data.id!;
  }
}
