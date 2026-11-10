import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StandardEditorProps } from '@grafana/data';
import { DateTimeEditor } from './DateTimeEditor';
import { DEFAULT_OPTIONS, RevealOptions } from '../../types';

type Props = StandardEditorProps<string | undefined, {}, RevealOptions>;

// Jest runs with TZ=UTC (jest.config.js), so the browser-local display equals the stored UTC time.
const STORED = '2026-12-25T08:30:15.000Z';

function editorProps(value: string | undefined, onChange: jest.Mock) {
  return {
    value,
    onChange,
    context: { data: [], options: DEFAULT_OPTIONS },
    item: { id: 'revealDate', name: 'Reveal date' },
  } as unknown as Props;
}

function renderEditor(value?: string) {
  const onChange = jest.fn();
  const view = render(<DateTimeEditor {...editorProps(value, onChange)} />);
  const rerender = (next?: string) => view.rerender(<DateTimeEditor {...editorProps(next, onChange)} />);
  return { onChange, rerender };
}

const input = () => screen.getByTestId<HTMLInputElement>('data-testid date-time-input');

const clearIcon = () => screen.queryByTestId('times');

function type(text: string) {
  fireEvent.change(input(), { target: { value: text } });
}

describe('DateTimeEditor', () => {
  // The popup's hour/minute/second columns measure their option text on a canvas, which jsdom lacks.
  const getContext = HTMLCanvasElement.prototype.getContext;
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = (() => ({
      measureText: () => ({ width: 10 }),
    })) as unknown as typeof getContext;
  });
  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = getContext;
  });

  it('renders the stored value to the second', () => {
    renderEditor(STORED);
    expect(input()).toHaveValue('2026-12-25 08:30:15');
  });

  it('renders an empty field with a placeholder when nothing is stored', () => {
    renderEditor();
    expect(input()).toHaveValue('');
    expect(input()).toHaveAttribute('placeholder', 'Select date/time');
  });

  it('treats an unparseable stored value as empty', () => {
    renderEditor('not a date');
    expect(input()).toHaveValue('');
  });

  it('commits a typed date when the field loses focus', () => {
    const { onChange } = renderEditor(STORED);
    type('2027-01-02 03:04:05');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2027-01-02T03:04:05.000Z');
  });

  it('commits a typed date on Enter', () => {
    const { onChange } = renderEditor();
    input().focus();
    type('2027-01-02 03:04:05');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2027-01-02T03:04:05.000Z');
  });

  it('does not call onChange when the field is left without a change', () => {
    // Milliseconds are below the picker's precision and must not count as a change.
    const { onChange } = renderEditor('2026-12-25T08:30:15.678Z');
    fireEvent.blur(input());
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['nonsense', '2026-13-45 99:99:99', 'now'])('keeps the stored value when "%s" is typed', (text) => {
    // moment warns about the unparseable text the picker hands it.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { onChange } = renderEditor(STORED);
    type(text);
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.blur(input());
    expect(onChange).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  // The jest SVG mock drops the icon's click handler, so only its presence can be checked here.
  it('offers the clear icon only when a value is stored', () => {
    const { rerender } = renderEditor(STORED);
    expect(clearIcon()).not.toBeNull();
    rerender(undefined);
    expect(clearIcon()).toBeNull();
  });

  it('does not call onChange when an empty field is left empty', () => {
    const { onChange } = renderEditor();
    fireEvent.blur(input());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears when the text is deleted and the field is left', () => {
    const { onChange } = renderEditor(STORED);
    type('');
    fireEvent.blur(input());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('empties the field when the value is removed from outside', () => {
    const { rerender } = renderEditor(STORED);
    rerender(undefined);
    expect(input()).toHaveValue('');
    rerender('2027-01-02T03:04:05.000Z');
    expect(input()).toHaveValue('2027-01-02 03:04:05');
  });

  it('"Now" stores the current moment as an ISO string', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(Date.UTC(2026, 10, 10, 9, 8, 7));
      const { onChange } = renderEditor(STORED);
      fireEvent.click(screen.getByRole('button', { name: 'Now' }));
      expect(onChange).toHaveBeenCalledWith('2026-11-10T09:08:07.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('applies a day and time chosen in the calendar popup', () => {
    const { onChange } = renderEditor(STORED);
    fireEvent.click(screen.getByRole('button', { name: 'Time picker' }));
    fireEvent.click(screen.getByRole('button', { name: 'December 31, 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2026-12-31T08:30:15.000Z');
  });

  it('does not call onChange when the popup is cancelled', () => {
    const { onChange } = renderEditor(STORED);
    fireEvent.click(screen.getByRole('button', { name: 'Time picker' }));
    fireEvent.click(screen.getByRole('button', { name: 'December 31, 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('flags a start date that is not before the reveal date, and only on the start date field', () => {
    const mk = (id: string, value: string, revealDate: string) =>
      ({
        value,
        onChange: jest.fn(),
        context: { data: [], options: { ...DEFAULT_OPTIONS, revealDate } },
        item: { id, name: id },
      }) as unknown as Props;
    const reveal = '2026-12-25T08:30:15.000Z';
    const late = render(<DateTimeEditor {...mk('startDate', '2026-12-25T08:33:15.000Z', reveal)} />);
    expect(screen.getByText(/must be before the reveal date/)).toBeInTheDocument();
    late.unmount();
    const ok = render(<DateTimeEditor {...mk('startDate', '2026-12-01T00:00:00.000Z', reveal)} />);
    expect(screen.queryByText(/must be before the reveal date/)).not.toBeInTheDocument();
    ok.unmount();
    render(<DateTimeEditor {...mk('expireDate', '2026-12-26T00:00:00.000Z', reveal)} />);
    expect(screen.queryByText(/must be before the reveal date/)).not.toBeInTheDocument();
  });
});
