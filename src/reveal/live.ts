import { RevealOptions } from '../types';
import { ProgressInfo, computeProgress, computeRepeat, deriveSeed, repeatActive } from './progress';

const HOUR_MS = 60 * 60 * 1000;

export type LiveOptions = Partial<
  Pick<RevealOptions, 'startDate' | 'revealDate' | 'expireDate' | 'repeat' | 'modeSettings'>
>;

/**
 * What the panel shows at `now` when nothing overrides the schedule:
 * - 'expired'  past expireDate: the "expired" notice (wins over everything else)
 * - 'noDate'   one-off schedule without a usable reveal date: stuck at 0%
 * - 'waiting'  repeating schedule before its start date: blank
 * - 'hidden'   repeating schedule between cycles, or in a cycle the chance setting skipped: blank
 * - 'progress' the image at `raw` (one-off, or the revealing / shown phase of a cycle)
 */
export type LiveKind = 'expired' | 'noDate' | 'waiting' | 'hidden' | 'progress';

export interface LiveState {
  kind: LiveKind;
  /** Linear progress 0..1 the panel feeds into easing (0 for every non-'progress' kind but 'expired'). */
  raw: number;
  /** True when a repeating schedule drives the panel instead of startDate..revealDate. */
  repeating: boolean;
  seed: number;
  progress: ProgressInfo;
}

/**
 * Schedule state at `now` (epoch ms): one-off or repeating, with expiry. This is the single place
 * that decides between computeRepeat and computeProgress, so the panel and the editor agree.
 */
export function computeLive(options: LiveOptions | undefined, now: number): LiveState {
  const { startDate, revealDate, expireDate, repeat, modeSettings } = options ?? {};
  const seed = deriveSeed({ modeSettings: modeSettings ?? {}, revealDate });
  const repeating = repeatActive(repeat);
  const progress = repeating
    ? computeRepeat({ repeat: repeat!, startDate, expireDate, now, seed })
    : computeProgress({ startDate, revealDate, expireDate, now });
  const raw = progress.valid ? progress.raw : 0;

  let kind: LiveKind = 'progress';
  if (progress.expired) {
    kind = 'expired';
  } else if (!progress.valid) {
    kind = 'noDate';
  } else if (progress.phase === 'waiting' || progress.phase === 'hidden') {
    kind = progress.phase;
  }
  return { kind, raw, repeating, seed, progress };
}

/** Short wording for the states that are not a percentage; undefined for 'progress'. */
export function liveStatusText(state: LiveState): string | undefined {
  switch (state.kind) {
    case 'expired':
      return 'expired';
    case 'noDate':
      return 'no reveal date set';
    case 'waiting':
      return 'hidden until the start date';
    case 'hidden':
      // A chance of 0 never shows again, so there is no next cycle to wait for.
      return Number.isFinite(state.progress.msRemaining) ? 'hidden until next cycle' : 'hidden';
    default:
      return undefined;
  }
}

/**
 * How often a live view should re-read the clock: 1 s for repeat schedules and in the last hour
 * before the reveal or the expiry, otherwise 30 s. Undefined once nothing can change any more.
 */
export function liveTickMs(state: LiveState): number | undefined {
  const { progress, repeating } = state;
  if (progress.expired) {
    return undefined;
  }
  const expirePending = progress.msUntilExpire > 0;
  const revealPending = progress.valid && !progress.revealed;
  if (!repeating && !revealPending && !expirePending) {
    return undefined;
  }
  const fast =
    repeating ||
    (revealPending && progress.msRemaining < HOUR_MS) ||
    (expirePending && progress.msUntilExpire < HOUR_MS);
  return fast ? 1000 : 30_000;
}

/**
 * The moment (epoch ms) at which a one-off schedule reaches `pct` percent. Undefined for repeating
 * schedules (a percentage recurs every cycle) and when there is no usable reveal date.
 */
export function dateAtPercent(options: LiveOptions | undefined, pct: number): number | undefined {
  if (repeatActive(options?.repeat)) {
    return undefined;
  }
  // `now` is irrelevant here: only the window length is read.
  const window = computeProgress({ startDate: options?.startDate, revealDate: options?.revealDate, now: 0 });
  if (!window.valid) {
    return undefined;
  }
  const reveal = Date.parse(options!.revealDate!);
  const fraction = Math.max(0, Math.min(1, pct / 100));
  return reveal - window.windowMs * (1 - fraction);
}
