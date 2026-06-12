import {
  activityLabel,
  closeOutTimer,
  idleAnnotation,
  idleSecondsFromPings,
  fmtElapsed,
  fmtMinutes,
  inHandTodayMinutes,
  isAdjusted,
} from '../time-derivation';

describe('fmtElapsed', () => {
  it('renders mm:ss under an hour, h:mm:ss past it', () => {
    expect(fmtElapsed(0)).toBe('00:00');
    expect(fmtElapsed(47)).toBe('00:47');
    expect(fmtElapsed(125)).toBe('02:05');
    expect(fmtElapsed(3600)).toBe('1:00:00');
    expect(fmtElapsed(5025)).toBe('1:23:45');
  });
});

describe('fmtMinutes', () => {
  it('reads as minutes under an hour, h mm past it', () => {
    expect(fmtMinutes(47)).toBe('47 min');
    expect(fmtMinutes(60)).toBe('1h 00m');
    expect(fmtMinutes(125)).toBe('2h 05m');
  });
});

describe('closeOutTimer (R4 — the sub-60s rule follows start mode)', () => {
  it('timer_auto under 60s discards silently', () => {
    expect(closeOutTimer('timer_auto', 59)).toEqual({ action: 'discard_silently' });
  });

  it('timer_auto at/over 60s offers the rounded duration', () => {
    expect(closeOutTimer('timer_auto', 60)).toEqual({ action: 'offer', durationMinutes: 1 });
    expect(closeOutTimer('timer_auto', 2820)).toEqual({ action: 'offer', durationMinutes: 47 });
  });

  it('timer_manual keeps the shipped round-up-to-1-minute, even under 60s', () => {
    expect(closeOutTimer('timer_manual', 12)).toEqual({ action: 'offer', durationMinutes: 1 });
    expect(closeOutTimer('timer_manual', 95)).toEqual({ action: 'offer', durationMinutes: 2 });
  });
});

describe('isAdjusted (D10)', () => {
  it('flags a logged number a full minute away from the raw truth', () => {
    expect(isAdjusted({ rawSeconds: 2820 }, 47)).toBe(false); // exactly the elapsed
    expect(isAdjusted({ rawSeconds: 2820 }, 48)).toBe(true); // adjusted up
    expect(isAdjusted({ rawSeconds: 2820 }, 40)).toBe(true); // adjusted down
  });
});

describe('inHandTodayMinutes', () => {
  const NOW = new Date('2026-06-12T15:00:00Z');

  it('sums completed minutes with the live timer elapsed', () => {
    expect(inHandTodayMinutes(120, '2026-06-12T14:13:00Z', NOW)).toBe(167);
  });

  it('completed minutes only when nothing runs', () => {
    expect(inHandTodayMinutes(85, null, NOW)).toBe(85);
  });
});

describe('activityLabel', () => {
  it('maps keys to the v1 vocabulary', () => {
    expect(activityLabel('site_visit')).toBe('Site visit');
    expect(activityLabel(null)).toBe('—');
  });
});

describe('idle annotation (D10, provisional 8-min)', () => {
  const T = (mins) => mins * 60_000;
  const base = 1_000_000_000_000;

  it('no idle when pings are dense', () => {
    const pings = [0, 1, 2, 3, 4].map((m) => base + T(m));
    expect(idleSecondsFromPings(pings)).toBe(0);
  });

  it('sums gaps longer than an explicit threshold', () => {
    // 0 → 20m gap (idle) → +1m → 2m gap (not idle at an 8m threshold)
    const pings = [base, base + T(20), base + T(21), base + T(23)];
    expect(idleSecondsFromPings(pings, 8 * 60)).toBe(20 * 60);
  });

  it('a gap exactly at the threshold is not idle', () => {
    expect(idleSecondsFromPings([base, base + T(8)], 8 * 60)).toBe(0);
  });

  it('uses the FINAL 1-min default threshold (L3)', () => {
    // A 90s gap is idle at 1 min; a 45s gap is not.
    expect(idleSecondsFromPings([base, base + 90_000])).toBe(90);
    expect(idleSecondsFromPings([base, base + 45_000])).toBe(0);
  });

  it('annotation reads in whole minutes, or null under the 1-min threshold', () => {
    expect(idleAnnotation(0)).toBeNull();
    expect(idleAnnotation(45)).toBeNull();
    expect(idleAnnotation(60)).toBe('includes ~1 quiet minute');
    expect(idleAnnotation(8 * 60)).toBe('includes ~8 quiet minutes');
  });

  it('never affects the logged number — annotation is a separate field', () => {
    // closeOutTimer ignores idle entirely; this is a guard against regression.
    expect(closeOutTimer('timer_auto', 2820)).toEqual({ action: 'offer', durationMinutes: 47 });
  });
});
