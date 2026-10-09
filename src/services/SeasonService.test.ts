import { describe, expect, it } from 'vitest';
import type { SeasonsFile } from '../data/types';
import { isoWeek, SeasonService } from './SeasonService';

const config: SeasonsFile = {
  order: ['summer', 'autumn', 'winter', 'spring'],
  firstWeekSeason: 'summer',
  alwaysAvailable: [],
  seasons: ['summer', 'autumn', 'winter', 'spring'].map((id) => ({
    id,
    label: `season.${id}`,
    bonus: { element: 'fire', percent: 20 },
    resources: [],
    extra: `season.${id}_extra`,
  })),
};

/** Local date (months are 1-based here for readability). */
function day(year: number, month: number, date: number, hour = 12): Date {
  return new Date(year, month - 1, date, hour);
}

describe('isoWeek', () => {
  it.each([
    [day(2026, 1, 1), 2026, 1], // Thursday: week 1 of its own year
    [day(2025, 12, 29), 2026, 1], // Monday before New Year already belongs to 2026
    [day(2026, 10, 9), 2026, 41],
    [day(2026, 12, 31), 2026, 53], // 2026 has 53 weeks
    [day(2027, 1, 1), 2026, 53], // Friday 1 Jan 2027 is still week 53 of 2026
    [day(2027, 1, 3), 2026, 53],
    [day(2027, 1, 4), 2027, 1],
    [day(2021, 1, 3), 2020, 53],
    [day(2024, 12, 30), 2025, 1],
    [day(2023, 1, 1), 2022, 52], // Sunday
    [day(2023, 1, 2), 2023, 1],
  ])('%s is ISO week %i-%i', (date, year, week) => {
    expect(isoWeek(date)).toEqual({ year, week });
  });

  it('does not depend on the time of day', () => {
    expect(isoWeek(day(2026, 10, 12, 0))).toEqual(isoWeek(day(2026, 10, 18, 23)));
  });
});

describe('SeasonService', () => {
  const seasons = new SeasonService(config);

  it('makes the first week of the year Summer and changes every week', () => {
    expect(seasons.calendarSeasonId(day(2026, 1, 1))).toBe('summer'); // week 1
    expect(seasons.calendarSeasonId(day(2026, 1, 5))).toBe('autumn'); // week 2
    expect(seasons.calendarSeasonId(day(2026, 1, 12))).toBe('winter'); // week 3
    expect(seasons.calendarSeasonId(day(2026, 1, 19))).toBe('spring'); // week 4
    expect(seasons.calendarSeasonId(day(2026, 1, 26))).toBe('summer'); // week 5
    expect(seasons.calendarSeasonId(day(2026, 10, 9))).toBe('summer'); // week 41
  });

  it('starts every year with Summer, also after a 52-week year', () => {
    expect(seasons.calendarSeasonId(day(2023, 1, 1))).toBe('spring'); // 2022 week 52
    expect(seasons.calendarSeasonId(day(2023, 1, 2))).toBe('summer'); // 2023 week 1
  });

  it('continues the cycle in week 53, so Summer lasts two weeks across New Year', () => {
    expect(seasons.calendarSeasonId(day(2026, 12, 28))).toBe('summer'); // 2026 week 53
    expect(seasons.calendarSeasonId(day(2027, 1, 4))).toBe('summer'); // 2027 week 1
    expect(seasons.calendarSeasonId(day(2027, 1, 11))).toBe('autumn');
  });

  it('gives the moment of the next season change (Monday 00:00 local)', () => {
    const friday = day(2026, 10, 9, 15);
    expect(seasons.nextChange(friday)).toEqual(new Date(2026, 9, 12));
    expect(seasons.msUntilNext(friday)).toBe(new Date(2026, 9, 12).getTime() - friday.getTime());
    // On a Monday the change is a week away, not now.
    expect(seasons.nextChange(day(2026, 10, 12, 0))).toEqual(new Date(2026, 9, 19));
  });

  it('skips the double Summer week when looking for the next change', () => {
    expect(seasons.nextChange(day(2026, 12, 28))).toEqual(new Date(2027, 0, 11));
  });

  it('can force a season for debugging and cycle back to the calendar', () => {
    const service = new SeasonService(config, () => day(2026, 10, 9));
    expect(service.current().id).toBe('summer');
    service.override = 'winter';
    expect(service.current().id).toBe('winter');
    expect(service.calendarSeasonId()).toBe('summer');
    service.override = null;
    const seen: (string | null)[] = [];
    for (let i = 0; i < 5; i++) {
      service.cycleOverride();
      seen.push(service.override);
    }
    expect(seen).toEqual(['summer', 'autumn', 'winter', 'spring', null]);
  });
});
