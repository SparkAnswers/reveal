import React, { useCallback, useMemo } from 'react';
import { css } from '@emotion/css';
import { DateTime, dateTime, StandardEditorProps } from '@grafana/data';
import { Button, DateTimePicker, FieldValidationMessage, useStyles2 } from '@grafana/ui';
import { RevealOptions } from '../../types';

type Props = StandardEditorProps<string | undefined, {}, RevealOptions>;

/** The picker works to the second; a stored value may carry milliseconds (e.g. from "Now"). */
const sameSecond = (a: number, b: number) => Math.floor(a / 1000) === Math.floor(b / 1000);

/**
 * Date + time editor built on Grafana's own DateTimePicker (calendar popup, hour/minute/second
 * columns, Apply/Cancel), shown in the browser's local time zone. Stores an ISO-8601 UTC string, or
 * undefined when cleared.
 *
 * A typed value is committed when the field loses focus or on Enter. `onChange` is only called for
 * a real change: an invalid entry leaves the stored value alone, and re-committing the same moment
 * is ignored (the panel stamps the start date whenever the reveal date changes).
 */
export const DateTimeEditor: React.FC<Props> = ({ value, onChange, item, context }) => {
  const styles = useStyles2(getStyles);

  // A start date that is not before the reveal date cannot be used; say so instead of changing it.
  const revealMs = context?.options?.revealDate ? Date.parse(context.options.revealDate) : NaN;
  const startMs = value ? Date.parse(value) : NaN;
  const startTooLate =
    item?.id === 'startDate' &&
    !context?.options?.repeat?.enabled &&
    Number.isFinite(revealMs) &&
    Number.isFinite(startMs) &&
    startMs >= revealMs;

  // Memoised: the picker rewrites its text field whenever the `date` object changes identity, which
  // would otherwise discard half-typed input on every re-render of the options pane.
  const date = useMemo(() => {
    const ms = value ? Date.parse(value) : NaN;
    return Number.isFinite(ms) ? dateTime(ms) : undefined;
  }, [value]);

  const commit = useCallback(
    (next?: DateTime) => {
      if (!next) {
        if (value !== undefined) {
          onChange(undefined);
        }
        return;
      }
      // The picker accepts anything Grafana can parse as a time (e.g. "now") but hands back an
      // invalid date for it; never let that replace the stored value.
      if (!next.isValid()) {
        return;
      }
      const ms = next.valueOf();
      if (date && sameSecond(ms, date.valueOf())) {
        return;
      }
      onChange(new Date(ms).toISOString());
    },
    [value, date, onChange]
  );

  // The picker only commits typed text on blur: make Enter do the same.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.target.blur();
    }
  };

  // The picker ignores an emptied field; treat deleting the text and leaving as clearing.
  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement && e.target.value.trim() === '' && value !== undefined) {
      onChange(undefined);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <div className={styles.picker} onKeyDown={onKeyDown} onBlur={onBlur}>
          <DateTimePicker
            // The picker keeps its own text and does not reset it when the date is removed from
            // outside, so remount it whenever the value goes between set and empty.
            key={date ? 'set' : 'empty'}
            date={date}
            onChange={commit}
            showSeconds
            clearable
            timeZone="browser"
          />
        </div>
        <Button
          className={styles.now}
          variant="secondary"
          size="md"
          onClick={() => onChange(new Date().toISOString())}
          tooltip="Set to now"
        >
          Now
        </Button>
      </div>
      {startTooLate && <FieldValidationMessage>The start date must be before the reveal date.</FieldValidationMessage>}
    </div>
  );
};

const getStyles = () => ({
  wrap: css({
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    width: '100%',
  }),
  row: css({
    display: 'flex',
    alignItems: 'flex-start',
    gap: 4,
    width: '100%',
  }),
  // The picker sizes its field to the input's intrinsic width, which is wider than the options pane
  // leaves beside "Now"; make the field wrapper inside it fill the space it is given instead.
  picker: css({
    flex: '1 1 0',
    minWidth: 0,
    '& [data-testid="date-time-picker"] > div > div': {
      flex: '1 1 0',
      minWidth: 0,
    },
  }),
  now: css({
    flex: '0 0 auto',
  }),
});
