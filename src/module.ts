import { PanelPlugin, SelectableValue } from '@grafana/data';
import { Direction, Easing, RevealMode, RevealOptions, DEFAULT_OPTIONS, TimeSource } from './types';
import { MODES } from './reveal/modes';
import { COMBO_LAYERS } from './reveal/modes/combo';
import { RevealPanel } from './components/RevealPanel';
import { ImageUploadEditor } from './components/editors/ImageUploadEditor';
import { DateTimeEditor } from './components/editors/DateTimeEditor';
import { PreviewSliderEditor } from './components/editors/PreviewSliderEditor';

const REVEAL = ['Reveal'];
const SCHEDULE = ['Schedule'];
const PREVIEW = ['Preview'];

const repeating = (o: RevealOptions) => !!o.repeat?.enabled;

/** Modes whose tile / door / patch order is driven by a seed (combo only stacks unseeded layers). */
const SEEDED_MODES: RevealMode[] = ['jigsaw', 'shuffle', 'mosaic', 'puzzle', 'advent', 'scratch'];
const GRID_MODES: RevealMode[] = ['jigsaw', 'shuffle', 'mosaic', 'puzzle'];
/** combo reads direction for its wipe / blinds layers. */
const DIRECTION_MODES: RevealMode[] = ['wipe', 'blinds', 'combo'];

const modeIs =
  (...modes: RevealMode[]) =>
  (o: RevealOptions) =>
    modes.includes(o.mode);

const modeOptions: Array<SelectableValue<RevealMode>> = MODES.map((m) => ({
  value: m.id,
  label: m.name,
  description: m.description,
}));

const easingOptions: Array<SelectableValue<Easing>> = [
  { value: 'linear', label: 'Linear', description: 'Reveals at a constant rate' },
  { value: 'easeIn', label: 'Ease in', description: 'Keeps the surprise hidden longer, then rushes to the end' },
  { value: 'easeOut', label: 'Ease out', description: 'Reveals most of the image early' },
  { value: 'easeInOut', label: 'Ease in-out', description: 'Slow start and finish' },
  { value: 'steps', label: 'Steps', description: 'Reveals in discrete jumps (once a day by default)' },
];

const directionOptions: Array<SelectableValue<Direction>> = [
  { value: 'ltr', label: 'Left to right' },
  { value: 'rtl', label: 'Right to left' },
  { value: 'ttb', label: 'Top to bottom' },
  { value: 'btt', label: 'Bottom to top' },
  { value: 'center', label: 'From the centre' },
];

const timeSourceOptions: Array<SelectableValue<TimeSource>> = [
  { value: 'browser', label: 'Browser clock' },
  { value: 'dashboard', label: 'Dashboard time' },
];

export const plugin = new PanelPlugin<RevealOptions>(RevealPanel).setPanelOptions((builder) => {
  builder
    .addCustomEditor<{}, RevealOptions['image']>({
      id: 'image',
      path: 'image',
      name: 'Image',
      description: 'PNG, JPG, WebP or GIF. Stored with the dashboard JSON.',
      category: REVEAL,
      editor: ImageUploadEditor,
      defaultValue: DEFAULT_OPTIONS.image,
    })
    .addCustomEditor<{}, string | undefined>({
      id: 'revealDate',
      path: 'revealDate',
      name: 'Reveal date',
      description: 'The image is fully revealed at this moment.',
      category: REVEAL,
      editor: DateTimeEditor,
      defaultValue: DEFAULT_OPTIONS.revealDate,
      showIf: (o) => !repeating(o),
    })
    .addCustomEditor<{}, string | undefined>({
      id: 'startDate',
      path: 'startDate',
      name: 'Start date',
      description:
        'Set to "now" automatically when you pick a reveal date; the reveal runs from here to the reveal date. Must be before the reveal date. Clear it to reset to now.',
      category: REVEAL,
      editor: DateTimeEditor,
      defaultValue: DEFAULT_OPTIONS.startDate,
    })
    .addCustomEditor<{}, string | undefined>({
      id: 'expireDate',
      path: 'expireDate',
      name: 'Expire date (optional)',
      description: 'After this moment the image is hidden again.',
      category: REVEAL,
      editor: DateTimeEditor,
      defaultValue: DEFAULT_OPTIONS.expireDate,
    })
    .addSelect({
      path: 'mode',
      name: 'Reveal mode',
      category: REVEAL,
      defaultValue: DEFAULT_OPTIONS.mode,
      settings: { options: modeOptions },
    })
    .addNumberInput({
      path: 'modeSettings.blurMaxPx',
      name: 'Maximum blur',
      description: 'Blur radius in px at 0%. Sharpens to 0 px as the reveal completes.',
      category: REVEAL,
      settings: { placeholder: '40', min: 1, max: 200, integer: true },
      showIf: modeIs('blur', 'combo'),
    })
    .addNumberInput({
      path: 'modeSettings.pixelMaxSize',
      name: 'Maximum block size',
      description: 'Block size in px at 0%. Blocks shrink to 1 px as the reveal completes.',
      category: REVEAL,
      settings: { placeholder: '40', min: 2, max: 256, integer: true },
      showIf: modeIs('pixelate', 'combo'),
    })
    .addNumberInput({
      path: 'modeSettings.grid.cols',
      name: 'Grid columns',
      category: REVEAL,
      settings: { placeholder: 'per mode (jigsaw 8, shuffle 6, mosaic 16, puzzle 6)', min: 1, max: 48, integer: true },
      showIf: modeIs(...GRID_MODES),
    })
    .addNumberInput({
      path: 'modeSettings.grid.rows',
      name: 'Grid rows',
      category: REVEAL,
      settings: { placeholder: 'per mode (jigsaw 5, shuffle 4, mosaic 10, puzzle 4)', min: 1, max: 48, integer: true },
      showIf: modeIs(...GRID_MODES),
    })
    .addSelect({
      path: 'modeSettings.direction',
      name: 'Direction',
      category: REVEAL,
      settings: { options: directionOptions },
      showIf: modeIs(...DIRECTION_MODES),
    })
    .addNumberInput({
      path: 'modeSettings.doors',
      name: 'Doors',
      description: 'Defaults to one door per day in the window (1-60).',
      category: REVEAL,
      settings: { placeholder: 'one per day', min: 1, max: 60, integer: true },
      showIf: modeIs('advent'),
    })
    .addMultiSelect({
      path: 'modeSettings.combo',
      name: 'Combined modes',
      description:
        'Modes stacked in order; each receives the same progress. Filter, pixelate and clip modes can be combined.',
      category: REVEAL,
      settings: { options: modeOptions.filter((o) => COMBO_LAYERS.includes(o.value as RevealMode)) },
      showIf: modeIs('combo'),
    })
    .addNumberInput({
      path: 'modeSettings.seed',
      name: 'Seed',
      description: 'Leave empty to derive from the reveal date',
      category: REVEAL,
      settings: { placeholder: 'derived', integer: true },
      showIf: modeIs(...SEEDED_MODES),
    })
    .addSelect({
      path: 'easing',
      name: 'Easing curve',
      description: 'Ease in keeps the surprise hidden longer; Steps reveals in daily jumps.',
      category: REVEAL,
      defaultValue: DEFAULT_OPTIONS.easing,
      settings: { options: easingOptions },
    })
    .addNumberInput({
      path: 'modeSettings.steps',
      name: 'Steps',
      description: 'Defaults to one step per whole day in the window.',
      category: REVEAL,
      settings: { placeholder: 'one per day', min: 1, integer: true },
      showIf: (o) => o.easing === 'steps' && !o.modeSettings?.stepEvery,
    })
    .addTextInput({
      path: 'modeSettings.stepEvery',
      name: 'Step interval',
      description: 'Advance once per interval instead of a step count, e.g. 30s, 10m, 1h, 1d.',
      category: REVEAL,
      settings: { placeholder: 'e.g. 1h' },
      showIf: (o) => o.easing === 'steps',
    })
    .addRadio({
      path: 'timeSource',
      name: 'Time source',
      description:
        'Dashboard time follows the end of the time picker range to look back at earlier states. It never runs ahead of the real clock, and repeat schedules always use the real clock.',
      category: REVEAL,
      defaultValue: DEFAULT_OPTIONS.timeSource,
      settings: { options: timeSourceOptions },
    })
    .addBooleanSwitch({
      path: 'showCountdown',
      name: 'Show countdown',
      category: REVEAL,
      defaultValue: DEFAULT_OPTIONS.showCountdown,
    })
    .addTextInput({
      path: 'caption',
      name: 'Caption on reveal',
      category: REVEAL,
      settings: { placeholder: 'Shown over the image at 100%' },
    })
    .addColorPicker({
      path: 'background',
      name: 'Background',
      description: 'Shows through transparent images and in unrevealed areas.',
      category: REVEAL,
      settings: { enableNamedColors: true },
    })
    .addBooleanSwitch({
      path: 'animateBeforeReveal',
      name: 'Animate GIFs before reveal',
      description: "Off keeps GIFs frozen until fully revealed so frames don't spoil the surprise",
      category: REVEAL,
      defaultValue: DEFAULT_OPTIONS.animateBeforeReveal,
    })
    .addBooleanSwitch({
      path: 'repeat.enabled',
      name: 'Repeat',
      description: 'Cycle the reveal on a schedule instead of a single reveal date. The panel is blank between cycles.',
      category: SCHEDULE,
      defaultValue: false,
    })
    .addTextInput({
      path: 'repeat.every',
      name: 'Every',
      description: 'Cycle length, e.g. 2m, 15m, 1h, 1d.',
      category: SCHEDULE,
      settings: { placeholder: 'e.g. 2m' },
      showIf: repeating,
    })
    .addTextInput({
      path: 'repeat.revealOver',
      name: 'Reveal over',
      description: 'How long the reveal takes at the start of each cycle. Empty or 0 = instant.',
      category: SCHEDULE,
      settings: { placeholder: 'e.g. 30s (instant if empty)' },
      showIf: repeating,
    })
    .addTextInput({
      path: 'repeat.showFor',
      name: 'Show for',
      description: 'How long it stays fully shown. Empty = until the next cycle.',
      category: SCHEDULE,
      settings: { placeholder: 'e.g. 1m' },
      showIf: repeating,
    })
    .addRadio({
      path: 'repeat.align',
      name: 'Align cycles to',
      description:
        'Clock: cycles start on minute/hour boundaries, the same for every panel. Start date: cycles count from the start date.',
      category: SCHEDULE,
      defaultValue: 'clock',
      settings: {
        options: [
          { value: 'clock', label: 'Clock' },
          { value: 'start', label: 'Start date' },
        ],
      },
      showIf: repeating,
    })
    .addTextInput({
      path: 'repeat.offset',
      name: 'Offset',
      description:
        "Shift this panel's cycle. Every 2m with offset 1m = odd minutes; another panel with offset 0 = even minutes.",
      category: SCHEDULE,
      settings: { placeholder: 'e.g. 1m' },
      showIf: repeating,
    })
    .addSliderInput({
      path: 'repeat.chance',
      name: 'Chance per cycle',
      description: 'Percent of cycles that show. Seeded so every viewer sees the same pattern. 100 = every cycle.',
      category: SCHEDULE,
      defaultValue: 100,
      settings: { min: 0, max: 100, step: 5 },
      showIf: repeating,
    })
    .addCustomEditor<{}, RevealOptions['previewOverride']>({
      id: 'previewOverride',
      path: 'previewOverride',
      name: 'Preview at',
      category: PREVIEW,
      editor: PreviewSliderEditor,
    });
});
