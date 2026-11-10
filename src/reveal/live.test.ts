import { computeLive, dateAtPercent, liveStatusText, liveTickMs, LiveOptions } from './live';
import { computeProgress, computeRepeat, deriveSeed } from './progress';

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0); // on a 10-minute boundary
const MIN = 60_000;
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

// Clock-aligned cycle: reveal for 2 minutes, show for 3, hide for the remaining 5.
const REPEAT = { enabled: true, every: '10m', revealOver: '2m', showFor: '3m' };

describe('computeLive', () => {
  it('follows startDate..revealDate for a one-off schedule', () => {
    const options = { startDate: iso(NOW - 10 * DAY), revealDate: iso(NOW + 30 * DAY) };
    const live = computeLive(options, NOW);
    expect(live.kind).toBe('progress');
    expect(live.repeating).toBe(false);
    expect(live.raw).toBeCloseTo(0.25);
    expect(live.progress).toEqual(computeProgress({ ...options, now: NOW }));
    expect(liveStatusText(live)).toBeUndefined();
  });

  it('reports a one-off schedule as fully revealed after the reveal date', () => {
    const live = computeLive({ startDate: iso(NOW - 10 * DAY), revealDate: iso(NOW - DAY) }, NOW);
    expect(live).toMatchObject({ kind: 'progress', raw: 1 });
  });

  it('has no percentage without a usable reveal date', () => {
    for (const options of [undefined, {}, { revealDate: 'not a date' }, { startDate: iso(NOW - DAY) }]) {
      const live = computeLive(options, NOW);
      expect(live).toMatchObject({ kind: 'noDate', raw: 0, repeating: false });
      expect(liveStatusText(live)).toBe('no reveal date set');
    }
  });

  it('ignores a repeat schedule that is off or has no usable period', () => {
    const dates = { startDate: iso(NOW - 10 * DAY), revealDate: iso(NOW + 30 * DAY) };
    for (const repeat of [{ ...REPEAT, enabled: false }, { enabled: true, every: 'soon' }]) {
      const live = computeLive({ ...dates, repeat }, NOW);
      expect(live.repeating).toBe(false);
      expect(live.raw).toBeCloseTo(0.25);
    }
  });

  it('uses the cycle, not the reveal date, for a repeating schedule', () => {
    // The one-off dates say 25%; the cycle says otherwise.
    const options: LiveOptions = { startDate: iso(NOW - 10 * DAY), revealDate: iso(NOW + 30 * DAY), repeat: REPEAT };

    const revealing = computeLive(options, NOW + MIN);
    expect(revealing).toMatchObject({ kind: 'progress', repeating: true });
    expect(revealing.raw).toBeCloseTo(0.5);
    expect(revealing.progress.phase).toBe('revealing');

    const shown = computeLive(options, NOW + 3 * MIN);
    expect(shown).toMatchObject({ kind: 'progress', raw: 1 });
    expect(shown.progress.phase).toBe('shown');
    expect(liveStatusText(shown)).toBeUndefined();

    const hidden = computeLive(options, NOW + 6 * MIN);
    expect(hidden).toMatchObject({ kind: 'hidden', raw: 0 });
    expect(liveStatusText(hidden)).toBe('hidden until next cycle');
  });

  it('matches computeRepeat with the derived seed', () => {
    const options: LiveOptions = { revealDate: iso(NOW + DAY), repeat: { ...REPEAT, chance: 50 } };
    const seed = deriveSeed({ modeSettings: {}, revealDate: options.revealDate });
    const live = computeLive(options, NOW + MIN);
    expect(live.seed).toBe(seed);
    expect(live.progress).toEqual(computeRepeat({ repeat: options.repeat!, now: NOW + MIN, seed }));
    expect(computeLive({ ...options, modeSettings: { seed: 7 } }, NOW).seed).toBe(7);
  });

  it('is waiting before the start date of a repeating schedule', () => {
    const live = computeLive({ startDate: iso(NOW + DAY), repeat: REPEAT }, NOW + MIN);
    expect(live).toMatchObject({ kind: 'waiting', raw: 0 });
    expect(liveStatusText(live)).toBe('hidden until the start date');
  });

  it('hides cycles the chance setting skips, even inside their reveal window', () => {
    const options: LiveOptions = { repeat: { ...REPEAT, chance: 50 }, modeSettings: { seed: 1234 } };
    // One minute into each of 40 consecutive cycles: half way through the reveal when the cycle shows.
    const kinds = Array.from({ length: 40 }, (_, k) => computeLive(options, NOW + k * 10 * MIN + MIN));
    const skipped = kinds.filter((l) => l.kind === 'hidden');
    const showing = kinds.filter((l) => l.kind === 'progress');
    expect(skipped.length).toBeGreaterThan(0);
    expect(showing.length).toBeGreaterThan(0);
    expect(skipped.length + showing.length).toBe(40);
    skipped.forEach((l) => {
      expect(l.raw).toBe(0);
      expect(liveStatusText(l)).toBe('hidden until next cycle');
    });
    showing.forEach((l) => expect(l.raw).toBeCloseTo(0.5));
  });

  it('never promises a next cycle when the chance is 0', () => {
    const live = computeLive({ repeat: { ...REPEAT, chance: 0 } }, NOW + MIN);
    expect(live.kind).toBe('hidden');
    expect(liveStatusText(live)).toBe('hidden');
  });

  it('is expired past the expire date, whatever the schedule', () => {
    const expireDate = iso(NOW - MIN);
    const cases: LiveOptions[] = [
      { startDate: iso(NOW - 10 * DAY), revealDate: iso(NOW - DAY), expireDate },
      { expireDate },
      { repeat: REPEAT, expireDate },
    ];
    for (const options of cases) {
      const live = computeLive(options, NOW + MIN);
      expect(live.kind).toBe('expired');
      expect(liveStatusText(live)).toBe('expired');
    }
    const pending = computeLive({ revealDate: iso(NOW - DAY), expireDate: iso(NOW + DAY) }, NOW);
    expect(pending).toMatchObject({ kind: 'progress', raw: 1 });
  });
});

describe('liveTickMs', () => {
  const tick = (options: LiveOptions, now = NOW) => liveTickMs(computeLive(options, now));

  it('ticks slowly far from the reveal and every second in the last hour', () => {
    expect(tick({ startDate: iso(NOW - DAY), revealDate: iso(NOW + DAY) })).toBe(30_000);
    expect(tick({ startDate: iso(NOW - DAY), revealDate: iso(NOW + 10 * MIN) })).toBe(1000);
  });

  it('stops once nothing can change', () => {
    expect(tick({})).toBeUndefined();
    expect(tick({ startDate: iso(NOW - 2 * DAY), revealDate: iso(NOW - DAY) })).toBeUndefined();
    expect(tick({ revealDate: iso(NOW - DAY), expireDate: iso(NOW - MIN) })).toBeUndefined();
    expect(tick({ repeat: REPEAT, expireDate: iso(NOW - MIN) })).toBeUndefined();
  });

  it('keeps ticking towards a pending expiry', () => {
    expect(tick({ revealDate: iso(NOW - DAY), expireDate: iso(NOW + DAY) })).toBe(30_000);
    expect(tick({ revealDate: iso(NOW - DAY), expireDate: iso(NOW + MIN) })).toBe(1000);
    expect(tick({ expireDate: iso(NOW + DAY) })).toBe(30_000);
  });

  it('ticks every second for repeating schedules, hidden phases included', () => {
    expect(tick({ repeat: REPEAT }, NOW + MIN)).toBe(1000);
    expect(tick({ repeat: REPEAT }, NOW + 6 * MIN)).toBe(1000);
    expect(tick({ repeat: REPEAT, startDate: iso(NOW + DAY) })).toBe(1000);
  });
});

describe('dateAtPercent', () => {
  it('maps a percentage onto the start..reveal window', () => {
    const options = { startDate: iso(NOW), revealDate: iso(NOW + 10 * DAY) };
    expect(dateAtPercent(options, 0)).toBe(NOW);
    expect(dateAtPercent(options, 50)).toBe(NOW + 5 * DAY);
    expect(dateAtPercent(options, 100)).toBe(NOW + 10 * DAY);
    expect(dateAtPercent(options, 250)).toBe(NOW + 10 * DAY);
  });

  it('uses the 30-day fallback window the panel uses when the start date is unusable', () => {
    expect(dateAtPercent({ revealDate: iso(NOW) }, 0)).toBe(NOW - 30 * DAY);
    expect(dateAtPercent({ startDate: iso(NOW + DAY), revealDate: iso(NOW) }, 50)).toBe(NOW - 15 * DAY);
  });

  it('has no date for repeating schedules or without a reveal date', () => {
    expect(dateAtPercent({ revealDate: iso(NOW + DAY), repeat: REPEAT }, 50)).toBeUndefined();
    expect(dateAtPercent({}, 50)).toBeUndefined();
    expect(dateAtPercent(undefined, 50)).toBeUndefined();
    expect(dateAtPercent({ revealDate: 'nope' }, 50)).toBeUndefined();
  });
});
