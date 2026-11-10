/**
 * Panel options for the Reveal panel.
 *
 * Concept: the panel holds one image (or GIF) and a reveal date. Progress p in [0,1]
 * is the elapsed fraction between startDate and revealDate. The selected reveal mode
 * renders the image "p-revealed". At p = 1 the image is shown in full.
 *
 * This file is the contract between the reveal engine (src/reveal), the panel
 * (src/components) and the editors (src/components/editors). Keep it in sync with
 * mockups/ARCHITECTURE.md.
 */

export type RevealMode =
  | 'fade'
  | 'blur'
  | 'pixelate'
  | 'jigsaw'
  | 'shuffle'
  | 'wipe'
  | 'iris'
  | 'scratch'
  | 'blinds'
  | 'mosaic'
  | 'brightness'
  | 'color'
  | 'advent'
  | 'puzzle'
  | 'combo'
  | 'instant';

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'steps';

export type Direction = 'ltr' | 'rtl' | 'ttb' | 'btt' | 'center';

export type TimeSource = 'browser' | 'dashboard';

export interface ImageRef {
  /** 'dataUrl' = stored inline in the dashboard JSON. 'url' = external link. 'resource' reserved for a v2 backend. */
  kind: 'dataUrl' | 'url' | 'resource';
  src: string;
  mime?: string;
  width?: number;
  height?: number;
  bytes?: number;
  name?: string;
}

export interface ModeSettings {
  /** blur: max blur radius in px at p = 0 (default 40). */
  blurMaxPx?: number;
  /** pixelate: block size in px at p = 0 (default 40). */
  pixelMaxSize?: number;
  /** jigsaw / shuffle / mosaic / puzzle grid. */
  grid?: { cols: number; rows: number };
  /** wipe / blinds direction (iris is always centred). */
  direction?: Direction;
  /** Seed for every seeded order. Default: derived from revealDate. */
  seed?: number;
  /** combo: ordered stack of modes, each receiving the same eased p. */
  combo?: RevealMode[];
  /** steps easing: number of steps. Default: number of whole days in the window. */
  steps?: number;
  /** advent: number of doors. Default: number of whole days in the window (min 1, max 60). */
  doors?: number;
  /** steps easing: step interval as a duration ("10m", "1h", "1d"). Overrides `steps` when set. */
  stepEvery?: string;
}

/**
 * Repeating schedule. When enabled the panel cycles: hidden -> revealing (over `revealOver`) ->
 * shown (for `showFor`) -> hidden, every `every`. Cycles are aligned to the wall clock by default so
 * "every 2m, offset 1m" means odd minutes, and a seeded `chance` lets panels appear at random while
 * every viewer still sees the same thing.
 */
export interface RepeatSettings {
  enabled?: boolean;
  /** Cycle length, e.g. "2m", "1h". Required when enabled. */
  every?: string;
  /** How long the reveal takes within a cycle ("0" or empty = instant). */
  revealOver?: string;
  /** How long it stays fully shown after revealing. Default: the rest of the cycle. */
  showFor?: string;
  /** 'clock' aligns cycles to the epoch (minute/hour boundaries); 'start' aligns to startDate. */
  align?: 'clock' | 'start';
  /** Shift the cycle start, e.g. "1m" with every "2m" = odd minutes. */
  offset?: string;
  /** 0-100: probability that a given cycle shows at all (seeded per cycle). Default 100. */
  chance?: number;
}

export interface RevealOptions {
  image?: ImageRef;
  repeat?: RepeatSettings;
  /** ISO-8601. Stamped automatically when the reveal date is first picked in the editor; otherwise 30 days before revealDate. */
  startDate?: string;
  /** ISO-8601. Required for any reveal to happen. */
  revealDate?: string;
  /** ISO-8601, optional. After this moment the image is hidden again and an "expired" notice is shown. */
  expireDate?: string;
  mode: RevealMode;
  modeSettings: ModeSettings;
  easing: Easing;
  timeSource: TimeSource;
  showCountdown: boolean;
  /** Shown over the image once fully revealed. */
  caption?: string;
  /** Background behind the image (visible through transparent PNGs and in unrevealed areas). Theme colour name or CSS colour. */
  background?: string;
  /** Animated GIFs only play once fully revealed (otherwise frames leak the surprise). */
  animateBeforeReveal: boolean;
  /**
   * Legacy and ignored. 1.0.0 stored the preview slider here, which leaked into saved dashboards.
   * The preview now lives in memory only (src/components/previewStore.ts); this path remains solely
   * as the anchor for the Preview editor in the options pane and is never written.
   */
  previewOverride?: number | null;
}

export const DEFAULT_OPTIONS: RevealOptions = {
  mode: 'blur',
  modeSettings: {},
  easing: 'easeIn',
  timeSource: 'browser',
  showCountdown: true,
  animateBeforeReveal: false,
};

/** Upload guard rails (base64-encoded size). */
export const WARN_BYTES = 1 * 1024 * 1024;
export const MAX_BYTES = 4 * 1024 * 1024;
