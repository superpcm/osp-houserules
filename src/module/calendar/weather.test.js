import { describe, expect, it } from 'vitest';
import { SECONDS_PER_DAY as DAY, dateToSeconds } from './calendar.js';
import { BUFFALO_NORMALS, forecastWeather, weatherAt } from './weather.js';

const day = (month, date = 1) => dateToSeconds({ year: 742, month, day: date });

describe('deterministic calendar weather', () => {
  it('exposes the exact immutable Buffalo normal arrays and source', () => {
    expect(BUFFALO_NORMALS.source).toBe('https://www.weather.gov/buf/newnormals');
    expect(BUFFALO_NORMALS.highF).toEqual([32.1, 33.3, 41.8, 54.7, 67.4, 75.6, 80.2, 79, 72.3, 59.6, 47.8, 37.2]);
    expect(BUFFALO_NORMALS.lowF).toEqual([19, 19.5, 26.4, 36.5, 48.3, 58.1, 63.1, 61.7, 54.5, 43.9, 34.2, 25.6]);
    expect(BUFFALO_NORMALS.precipitationIn).toEqual([3.35, 2.49, 2.89, 3.37, 3.37, 3.37, 3.23, 3.23, 4.1, 4.03, 3.5, 3.75]);
    expect(BUFFALO_NORMALS.snowIn).toEqual([26.7, 18.1, 14.1, 2.5, 0, 0, 0, 0, 0, 0.9, 7.8, 25.3]);
    expect(Object.isFrozen(BUFFALO_NORMALS)).toBe(true);
  });
  it('keeps each three-hour period stable and validates dates', () => {
    const start = day(6, 4);
    expect(weatherAt(start + 10, 'seed')).toEqual(weatherAt(start + 2 * 3600, 'seed'));
    expect(() => weatherAt(-1, 'seed')).toThrow();
    expect(() => weatherAt(0.5, 'seed')).toThrow();
    expect(weatherAt(start, 'seed')).not.toEqual(weatherAt(start, 'different'));
  });
  it('returns the requested daily shape with eight periods and midnight dates', () => {
    const forecast = forecastWeather(day(12, 30) + 18 * 3600, 'campaign', { days: 7 });
    expect(forecast).toHaveLength(7);
    expect(forecast.map(record => record.date)).toEqual(Array.from({ length: 7 }, (_, index) => day(12, 30) + index * DAY));
    expect(forecast.every(record => Boolean(record.periods))).toBe(true);
    expect(forecast.every(record => record.periods.length === 8)).toBe(true);
    expect(forecast[0].highF).toBeGreaterThanOrEqual(forecast[0].lowF);
  });
  it('is reproducible by call and varies across seeds and periods', () => {
    const first = forecastWeather(day(7), 'alpha');
    expect(forecastWeather(day(7), 'alpha')).toEqual(first);
    expect(forecastWeather(day(7), 'beta')).not.toEqual(first);
    expect(new Set(first.flatMap(record => record.periods.map(period => period.temperatureF))).size).toBeGreaterThan(1);
  });
  it('keeps Buffalo-flavoured winter colder and snowier than summer', () => {
    const winter = forecastWeather(day(1), 'season', { days: 30 }).flatMap(record => record.periods);
    const summer = forecastWeather(day(7), 'season', { days: 30 }).flatMap(record => record.periods);
    expect(winter.reduce((sum, period) => sum + period.temperatureF, 0) / winter.length).toBeLessThan(summer.reduce((sum, period) => sum + period.temperatureF, 0) / summer.length);
    expect(winter.filter(period => period.precipitation === 'snow').length).toBeGreaterThanOrEqual(summer.filter(period => period.precipitation === 'snow').length);
  });
  it('returns only safe public fields and complete guidance', () => {
    const period = weatherAt(day(10), 'safe');
    expect(Object.keys(period).sort()).toEqual(['condition', 'conditionKey', 'guidance', 'icon', 'periodEnd', 'periodStart', 'precipitation', 'severity', 'temperatureF', 'visibility', 'windDirection', 'windMph'].sort());
    expect(['Fair', 'Minor', 'Moderate', 'Severe', 'Extreme']).toContain(period.severity);
    expect(Object.keys(period.guidance).sort()).toEqual(['combat', 'movement', 'travel', 'visibility']);
  });
  it('never labels a period rainy while reporting no precipitation', () => {
    const periods = forecastWeather(day(10), 'rain-check', { days: 30 }).flatMap(record => record.periods);
    expect(periods.filter(period => period.conditionKey === 'rain').every(period => period.precipitation !== 'none')).toBe(true);
  });
});
