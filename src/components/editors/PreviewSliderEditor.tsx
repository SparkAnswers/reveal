import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, StandardEditorProps, dateTimeFormat } from '@grafana/data';
import { Button, Slider, useStyles2 } from '@grafana/ui';
import { RevealOptions } from '../../types';
import { computeLive, dateAtPercent, liveStatusText, liveTickMs } from '../../reveal/live';
import { setPreview, usePreview } from '../previewStore';

type Props = StandardEditorProps<number | null | undefined, {}, RevealOptions>;

const MARKS = { 0: '0%', 25: '25%', 50: '50%', 75: '75%', 100: '100%' };

/**
 * Editor-only scrubber. `null` means "follow the live schedule". The value is kept in memory (see
 * previewStore) and never written to the panel options, so it is not saved with the dashboard.
 *
 * The label mirrors what the panel renders: while Live it follows the schedule (one-off or
 * repeating, including the blank and expired states); while previewing it shows the scrubbed
 * percentage, which the panel applies regardless of the schedule.
 */
export const PreviewSliderEditor: React.FC<Props> = ({ context }) => {
  const value = usePreview();
  const styles = useStyles2(getStyles);
  const opts = context.options;
  const isLive = value === null;

  // The editor has no dashboard time range, so Live follows the browser clock.
  const [now, setNow] = useState(() => Date.now());
  const live = computeLive(opts, now);
  const tick = isLive ? liveTickMs(live) : undefined;
  useEffect(() => {
    if (tick === undefined) {
      return;
    }
    const update = () => setNow(Date.now());
    // Catch up straight away (the clock is not advanced while a preview is set), then keep ticking.
    const first = setTimeout(update, 0);
    const id = setInterval(update, tick);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [tick]);

  const pct = isLive ? Math.round(live.raw * 100) : Math.round(value);
  const status = isLive ? liveStatusText(live) : undefined;

  // The date a percentage falls on only means something for a one-off schedule.
  let detail = status ?? `${pct}%`;
  if (!status) {
    const ms = dateAtPercent(opts, pct);
    if (ms !== undefined) {
      detail += ` · ${dateTimeFormat(ms, { format: 'MMM D, YYYY' })}`;
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <span>{isLive ? 'Live' : 'Preview at'}</span>
        <b data-testid="reveal-preview-status">{detail}</b>
      </div>
      <Slider
        min={0}
        max={100}
        step={1}
        value={pct}
        marks={MARKS}
        showInput={false}
        onChange={(v) => setPreview(v)}
        ariaLabelForHandle="Preview progress"
      />
      <div className={styles.foot}>
        <span>Editor-only. Not saved with the dashboard.</span>
        <Button size="sm" variant="secondary" fill="text" onClick={() => setPreview(null)} disabled={isLive}>
          Live
        </Button>
      </div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  wrap: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1) }),
  top: css({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
    b: { color: theme.colors.text.primary, fontWeight: theme.typography.fontWeightMedium },
  }),
  foot: css({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(2),
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.disabled,
  }),
});
