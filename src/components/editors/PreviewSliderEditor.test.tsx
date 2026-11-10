import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { StandardEditorProps } from '@grafana/data';
import { PreviewSliderEditor } from './PreviewSliderEditor';
import { setPreview } from '../previewStore';
import { DEFAULT_OPTIONS, RevealOptions } from '../../types';

const search: Record<string, unknown> = {};
jest.mock('@grafana/runtime', () => ({ locationService: { getSearchObject: () => search } }));

type Props = StandardEditorProps<number | null | undefined, {}, RevealOptions>;

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0); // on a 10-minute boundary
const MIN = 60_000;
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
// Clock-aligned cycle: reveal for 2 minutes, show for 3, hide for the remaining 5.
const REPEAT = { enabled: true, every: '10m', revealOver: '2m', showFor: '3m' };
const DATE = /[A-Z][a-z]{2} \d{1,2}, \d{4}/;

function renderEditor(overrides: Partial<RevealOptions>) {
  const onChange = jest.fn();
  const props = {
    value: undefined,
    onChange,
    context: { data: [], options: { ...DEFAULT_OPTIONS, ...overrides } },
    item: { id: 'previewOverride', name: 'Preview at' },
  } as unknown as Props;
  const view = render(<PreviewSliderEditor {...props} />);
  return { ...view, onChange };
}

const heading = () => screen.getByTestId('reveal-preview-status').parentElement!;
const status = () => screen.getByTestId('reveal-preview-status');
const sliderValue = () => screen.getByRole('slider').getAttribute('aria-valuenow');

describe('PreviewSliderEditor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    search.editPanel = '1';
  });
  afterEach(() => {
    act(() => setPreview(null));
    delete search.editPanel;
    jest.useRealTimers();
  });

  it('shows the live percentage and its date for a one-off schedule', () => {
    renderEditor({ startDate: iso(NOW - 10 * DAY), revealDate: iso(NOW + 30 * DAY) });
    expect(heading()).toHaveTextContent(/^Live25% · /);
    expect(status()).toHaveTextContent(DATE);
    expect(sliderValue()).toBe('25');
    expect(screen.getByText('Editor-only. Not saved with the dashboard.')).toBeInTheDocument();
  });

  it('says so when there is no reveal date', () => {
    renderEditor({});
    expect(heading()).toHaveTextContent(/^Liveno reveal date set$/);
    expect(sliderValue()).toBe('0');
  });

  it('follows the cycle of a repeating schedule and never shows a date', () => {
    // The one-off dates alone would say 25%.
    renderEditor({ startDate: iso(NOW - 10 * DAY), revealDate: iso(NOW + 30 * DAY), repeat: REPEAT });
    act(() => {
      jest.advanceTimersByTime(MIN);
    });
    expect(status()).toHaveTextContent(/^50%$/);
    expect(sliderValue()).toBe('50');

    act(() => {
      jest.advanceTimersByTime(2 * MIN);
    });
    expect(status()).toHaveTextContent(/^100%$/);

    act(() => {
      jest.advanceTimersByTime(3 * MIN);
    });
    expect(heading()).toHaveTextContent(/^Livehidden until next cycle$/);
    expect(sliderValue()).toBe('0');
  });

  it('reports the wait before a repeating schedule starts', () => {
    renderEditor({ startDate: iso(NOW + DAY), repeat: REPEAT });
    expect(status()).toHaveTextContent(/^hidden until the start date$/);
  });

  it('reports a schedule whose chance never lets a cycle show', () => {
    renderEditor({ repeat: { ...REPEAT, chance: 0 } });
    expect(status()).toHaveTextContent(/^hidden$/);
  });

  it('reports expiry instead of a percentage', () => {
    renderEditor({ startDate: iso(NOW - 10 * DAY), revealDate: iso(NOW - DAY), expireDate: iso(NOW - MIN) });
    expect(heading()).toHaveTextContent(/^Liveexpired$/);
  });

  it('keeps Live current while the editor stays open', () => {
    renderEditor({ startDate: iso(NOW - 10 * MIN), revealDate: iso(NOW + 10 * MIN) });
    expect(status()).toHaveTextContent(/^50% · /);
    act(() => {
      jest.advanceTimersByTime(5 * MIN);
    });
    expect(status()).toHaveTextContent(/^75% · /);
    act(() => {
      jest.advanceTimersByTime(10 * MIN);
    });
    expect(status()).toHaveTextContent(/^100% · /);
  });

  it('stops its timer on unmount', () => {
    const { unmount } = renderEditor({ repeat: REPEAT });
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('shows the scrubbed percentage while previewing, with a date only for one-off schedules', () => {
    const { onChange, unmount } = renderEditor({ startDate: iso(NOW - 10 * DAY), revealDate: iso(NOW + 30 * DAY) });
    act(() => setPreview(80));
    expect(heading()).toHaveTextContent(/^Preview at80% · /);
    expect(status()).toHaveTextContent(DATE);
    expect(sliderValue()).toBe('80');
    // Nothing ticks while a preview is pinned.
    expect(jest.getTimerCount()).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
    unmount();

    // Hidden phase of a repeating schedule: the preview still wins, as it does in the panel.
    renderEditor({ repeat: REPEAT, expireDate: iso(NOW - MIN) });
    expect(heading()).toHaveTextContent(/^Preview at80%$/);
  });

  it('returns to the live state when the preview is cleared', () => {
    renderEditor({ repeat: REPEAT });
    act(() => setPreview(80));
    act(() => {
      jest.setSystemTime(NOW + 6 * MIN);
      setPreview(null);
    });
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(heading()).toHaveTextContent(/^Livehidden until next cycle$/);
  });
});
