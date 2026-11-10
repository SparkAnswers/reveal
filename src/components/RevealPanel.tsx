import React, { useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, PanelProps, colorManipulator } from '@grafana/data';
import { Icon, useStyles2, useTheme2 } from '@grafana/ui';
import { RevealOptions } from '../types';
import {
  applyEasing,
  computeProgress,
  computeRepeat,
  deriveSeed,
  repeatActive,
  resolveSteps,
} from '../reveal/progress';
import { isGif } from '../reveal/image';
import { getMode } from '../reveal/modes';
import { Countdown, COUNTDOWN_HEIGHT } from './Countdown';
import { useStaticFrame } from './useStaticFrame';
import { editingPanelKey, usePreview } from './previewStore';

const HOUR = 60 * 60 * 1000;
const EMPTY_SETTINGS: RevealOptions['modeSettings'] = {};

export const RevealPanel: React.FC<PanelProps<RevealOptions>> = ({
  options,
  width,
  height,
  timeRange,
  onOptionsChange,
}) => {
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  const { image, startDate, revealDate, expireDate, timeSource, repeat } = options;
  // Preview scrubber: in-memory and only ever set for the panel open in the panel editor. Any
  // `previewOverride` saved in the dashboard JSON by 1.0.0 is deliberately ignored.
  const previewOverride = usePreview();
  const configuredBackground = options.background
    ? theme.visualization.getColorByName(options.background)
    : theme.components.input.background;
  // Grafana only seeds defaults for non-null defaultValues, so a fresh panel has no modeSettings object.
  const modeSettings = options.modeSettings ?? EMPTY_SETTINGS;

  // `clock` is the real (browser) time. Dashboard time may look back at an earlier state but never
  // ahead: it is capped at the real clock, so moving the time picker into the future cannot reveal
  // the image early or skip a hidden period.
  const [clock, setClock] = useState(() => Date.now());
  // Repeat schedules always run on the real clock: an older range would otherwise land in a past
  // "shown" phase and bring the image back during a hidden period.
  const repeating = repeatActive(repeat);
  const dashboardTime = timeSource === 'dashboard' && !repeating ? timeRange.to.valueOf() : NaN;
  const followsDashboard = Number.isFinite(dashboardTime);
  const now = followsDashboard ? Math.min(dashboardTime, clock) : clock;
  // The dashboard range changes on refresh, when the tick below may be idle: resync the real clock
  // so the cap is measured against the present and not against the last tick.
  useEffect(() => {
    if (!followsDashboard) {
      return;
    }
    const id = setTimeout(() => setClock(Date.now()), 0);
    return () => clearTimeout(id);
  }, [followsDashboard, dashboardTime]);

  const seed = useMemo(() => deriveSeed({ modeSettings, revealDate }), [modeSettings, revealDate]);
  const progress = useMemo(
    () =>
      repeating
        ? computeRepeat({ repeat: repeat!, startDate, expireDate, now, seed })
        : computeProgress({ startDate, revealDate, expireDate, now }),
    [repeating, repeat, startDate, revealDate, expireDate, now, seed]
  );

  // Stamp the start date when a reveal date is picked or changed in the panel editor, so the window
  // runs from "now" rather than from a stale start or the 30-day fallback. Only while editing: view
  // mode must never dirty the dashboard. A start date the user typed is never overwritten, even one
  // that is not before the reveal date (the editor flags it and the 30-day fallback applies).
  const prevReveal = useRef(revealDate);
  useEffect(() => {
    const changed = prevReveal.current !== revealDate;
    prevReveal.current = revealDate;
    if (!image || !revealDate || !onOptionsChange || repeating || !isEditingPanel()) {
      return;
    }
    const reveal = Date.parse(revealDate);
    const start = startDate ? Date.parse(startDate) : NaN;
    if (Number.isFinite(reveal) && (!Number.isFinite(start) || changed)) {
      const stamp = Math.min(Date.now(), reveal - 1000);
      onOptionsChange({ ...options, startDate: new Date(stamp).toISOString() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, revealDate, startDate]);

  const overriding = previewOverride !== null;
  const raw = overriding ? clamp01(previewOverride / 100) : progress.valid ? progress.raw : 0;
  const revealed = raw >= 1;
  // Expiry always follows the real clock, so an older dashboard range cannot bring an expired image back.
  const expireAt = expireDate ? Date.parse(expireDate) : NaN;
  const msUntilExpire = Number.isFinite(expireAt) ? Math.max(0, expireAt - clock) : 0;
  const expirePending = Number.isFinite(expireAt) && clock < expireAt;
  const expired = Number.isFinite(expireAt) && clock >= expireAt && !overriding;
  const fast =
    repeating || progress.msRemaining < HOUR || ((revealed || followsDashboard) && expirePending && msUntilExpire < HOUR);

  // Live tick: 1 s in the last hour (always, for repeat schedules), otherwise 30 s. Not needed once
  // revealed for good, without a usable reveal date, or when the preview slider drives progress.
  // Dashboard time at or behind the real clock is a fixed moment, so it only ticks for a pending
  // expiry; a range that ends in the future is capped at the real clock and ticks like the browser clock.
  const settled = (revealed && !expirePending && !repeating) || expired;
  const fixedMoment = followsDashboard && dashboardTime <= clock && !expirePending;
  useEffect(() => {
    if (settled || fixedMoment || overriding || !progress.valid || !image) {
      return;
    }
    const id = setInterval(() => setClock(Date.now()), fast ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [settled, fixedMoment, overriding, progress.valid, fast, image]);

  const p = applyEasing(raw, options.easing, resolveSteps(modeSettings, progress));
  const gif = isGif(image);
  const freeze = gif && !options.animateBeforeReveal && p < 1;
  // While frozen, `src` is a still PNG of the first frame, or undefined until it is captured (or if
  // it cannot be captured, e.g. a CORS-blocked GIF). The live GIF is never rendered in that state.
  const src = useStaticFrame(image?.src, freeze);

  if (!image?.src) {
    return (
      <div className={styles.wrapper} style={{ width, height }}>
        <div className={styles.empty} data-testid="reveal-empty">
          <div className={styles.emptyBox}>
            <Icon name="camera" size="lg" />
          </div>
          <div>Upload an image to get started</div>
        </div>
      </div>
    );
  }

  const mode = getMode(options.mode);
  const Mode = mode.Component;
  // Between repeat cycles (and before a scheduled start) the panel is completely blank.
  const hidden = !overriding && (progress.phase === 'hidden' || progress.phase === 'waiting');
  // Instant mode shows nothing at all until the reveal: no background block, no lock overlay.
  const blankUntilReveal = (mode.id === 'instant' && p < 1 && !expired) || hidden;
  const background = blankUntilReveal ? 'transparent' : configuredBackground;
  const stageHeight = Math.max(0, height - (options.showCountdown ? COUNTDOWN_HEIGHT : 0));
  const showCaption = p >= 1 && !!options.caption && !expired;

  return (
    <div className={styles.wrapper} style={{ width, height }}>
      <div className={styles.stage} style={{ height: stageHeight, background }}>
        {expired ? (
          <div className={styles.frozen} data-testid="reveal-expired">
            <Icon name="eye-slash" size="lg" />
            <span>This reveal has expired</span>
          </div>
        ) : hidden ? (
          <div data-testid="reveal-hidden" />
        ) : src ? (
          <Mode
            src={src}
            p={p}
            width={width}
            height={stageHeight}
            seed={seed}
            settings={modeSettings}
            isGif={gif && !freeze}
            days={progress.days}
          />
        ) : (
          <div className={styles.frozen} data-testid="reveal-frozen">
            GIF hidden until the reveal
          </div>
        )}
        {p <= 0.001 && !overriding && !expired && !blankUntilReveal && (
          <div className={styles.lock} aria-hidden>
            <Icon name="lock" size="lg" />
            <span>Not yet</span>
          </div>
        )}
        {showCaption && (
          <div className={styles.caption} data-testid="reveal-caption">
            {options.caption}
          </div>
        )}
      </div>
      {options.showCountdown && (
        <Countdown
          raw={raw}
          msRemaining={overriding ? (revealed ? 0 : progress.msRemaining) : progress.msRemaining}
          revealed={revealed}
          valid={progress.valid || overriding}
          revealDate={revealDate}
          expired={expired}
          expireDate={expireDate}
          msUntilExpire={overriding ? 0 : msUntilExpire}
          phase={overriding ? undefined : progress.phase}
          msUntilHide={overriding ? 0 : progress.msUntilHide}
        />
      )}
    </div>
  );
};

/** True while the panel is open in the panel editor. */
function isEditingPanel(): boolean {
  return editingPanelKey() !== undefined;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }),
  stage: css({
    position: 'relative',
    flex: 'none',
    overflow: 'hidden',
    borderRadius: theme.shape.radius.default,
    background: theme.components.input.background,
  }),
  empty: css({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1.5),
    textAlign: 'center',
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  emptyBox: css({
    width: 44,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1.5px dashed ${theme.colors.border.strong}`,
    borderRadius: theme.shape.radius.default,
    color: theme.colors.text.disabled,
  }),
  frozen: css({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding: theme.spacing(1),
    color: theme.colors.text.disabled,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  lock: css({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(0.75),
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
    pointerEvents: 'none',
  }),
  caption: css({
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: theme.spacing(3.5, 1.5, 1.25),
    background: `linear-gradient(transparent, ${colorManipulator.alpha(theme.colors.background.canvas, 0.8)})`,
    color: theme.colors.text.maxContrast,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.fontWeightMedium,
    textShadow: `0 1px 2px ${colorManipulator.alpha(theme.colors.background.canvas, 0.6)}`,
    pointerEvents: 'none',
  }),
});
