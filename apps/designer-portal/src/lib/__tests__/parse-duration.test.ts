import { parseDurationToMinutes, formatMinutes } from '../parse-duration';

describe('parseDurationToMinutes', () => {
  it('parses h:mm', () => {
    expect(parseDurationToMinutes('1:30')).toBe(90);
    expect(parseDurationToMinutes('0:45')).toBe(45);
    expect(parseDurationToMinutes('10:05')).toBe(605);
  });

  it('parses decimal hours', () => {
    expect(parseDurationToMinutes('1.5h')).toBe(90);
    expect(parseDurationToMinutes('2h')).toBe(120);
    expect(parseDurationToMinutes('0.25 hr')).toBe(15);
    expect(parseDurationToMinutes('1.5 hours')).toBe(90);
  });

  it('parses minutes', () => {
    expect(parseDurationToMinutes('90m')).toBe(90);
    expect(parseDurationToMinutes('45 min')).toBe(45);
    expect(parseDurationToMinutes('30 minutes')).toBe(30);
  });

  it('parses combined hours + minutes', () => {
    expect(parseDurationToMinutes('1h 30m')).toBe(90);
    expect(parseDurationToMinutes('1h30')).toBe(90);
    expect(parseDurationToMinutes('2h 15min')).toBe(135);
  });

  it('reads small bare numbers as hours, larger as minutes', () => {
    expect(parseDurationToMinutes('2')).toBe(120);
    expect(parseDurationToMinutes('1.5')).toBe(90);
    expect(parseDurationToMinutes('90')).toBe(90);
    expect(parseDurationToMinutes('15')).toBe(15);
  });

  it('rejects garbage and non-positive values', () => {
    expect(parseDurationToMinutes('')).toBeNull();
    expect(parseDurationToMinutes('abc')).toBeNull();
    expect(parseDurationToMinutes('0')).toBeNull();
    expect(parseDurationToMinutes('0m')).toBeNull();
    expect(parseDurationToMinutes('-30m')).toBeNull();
    expect(parseDurationToMinutes('1:75')).toBeNull();
  });
});

describe('formatMinutes', () => {
  it('formats h:mm', () => {
    expect(formatMinutes(90)).toBe('1:30');
    expect(formatMinutes(45)).toBe('0:45');
    expect(formatMinutes(605)).toBe('10:05');
  });
});
