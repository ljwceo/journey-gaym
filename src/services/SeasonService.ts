import type { SeasonDef, SeasonsFile } from '../data/types';

const DAY_MS = 86_400_000;

export interface IsoWeek {
  year: number;
  week: number;
}

/**
 * ISO 8601 week of a date, using the player's local calendar day. Weeks start on Monday;
 * week 1 is the week with the year's first Thursday, so 29 Dec – 3 Jan can belong to either year.
 */
export function isoWeek(date: Date): IsoWeek {
  // Work on the local calendar day as a UTC date so daylight saving time cannot shift it.
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = (day.getUTCDay() + 6) % 7; // Monday = 0 … Sunday = 6
  day.setUTCDate(day.getUTCDate() - weekday + 3); // Thursday of this week decides the year
  const year = day.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((day.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return { year, week };
}

/**
 * Season from the real date: ISO week 1 of every year is the first season in `order`'s cycle
 * (Summer), and the season changes every week. Week 53 simply continues the cycle, so in a
 * 53-week year Summer lasts two weeks across New Year. Both players see the same season without
 * a server. A debug override can force a season.
 */
export class SeasonService {
  /** Forced season id (debug), or null to follow the calendar. */
  override: string | null = null;

  private readonly byId: ReadonlyMap<string, SeasonDef>;
  private readonly firstIndex: number;

  constructor(
    private readonly config: SeasonsFile,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.byId = new Map(config.seasons.map((season) => [season.id, season]));
    this.firstIndex = Math.max(0, config.order.indexOf(config.firstWeekSeason));
  }

  /** Season id from the calendar only (ignores the override). */
  calendarSeasonId(date: Date = this.now()): string {
    const { week } = isoWeek(date);
    const order = this.config.order;
    return order[(this.firstIndex + week - 1) % order.length] as string;
  }

  /** The active season id (override first, then the calendar). */
  currentId(date: Date = this.now()): string {
    return this.override ?? this.calendarSeasonId(date);
  }

  current(date: Date = this.now()): SeasonDef {
    const season = this.byId.get(this.currentId(date));
    if (!season) throw new Error(`Unknown season: ${this.currentId(date)}`);
    return season;
  }

  /** Start of the next calendar season change (a Monday 00:00 local time). */
  nextChange(date: Date = this.now()): Date {
    const current = this.calendarSeasonId(date);
    const weekday = (date.getDay() + 6) % 7;
    // Local-time constructor: handles daylight saving time and month/year rollover.
    let candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7 - weekday);
    for (let i = 0; i < 8 && this.calendarSeasonId(candidate) === current; i++) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() + 7);
    }
    return candidate;
  }

  /** Milliseconds until the next calendar season change. */
  msUntilNext(date: Date = this.now()): number {
    return this.nextChange(date).getTime() - date.getTime();
  }

  /** Cycles the debug override through all seasons and back to the calendar. */
  cycleOverride(): void {
    const order = this.config.order;
    if (this.override === null) this.override = order[0] ?? null;
    else {
      const next = order.indexOf(this.override) + 1;
      this.override = next < order.length ? (order[next] as string) : null;
    }
  }
}
