import React, { useMemo } from 'react';
import { permutation } from '../rng';
import { ModeDefinition, ModeProps } from '../types';
import { Grid, RevealImage, Stage, TileImage, clamp01, makeTiles } from './shared';

export const MAX_DOORS = 60;

export function resolveDoors(doors: number | undefined, days: number): number {
  const d = doors !== undefined && Number.isFinite(doors) ? Math.floor(doors) : Math.floor(days);
  return Math.max(1, Math.min(MAX_DOORS, d));
}

/** Pick a cols×rows grid holding at least `doors` cells with near-square cells and little waste. */
export function adventGrid(doors: number, width: number, height: number): Grid {
  const aspect = width > 0 && height > 0 ? width / height : 1.6;
  let best: Grid = { cols: doors, rows: 1 };
  let bestScore = Infinity;
  for (let cols = 1; cols <= doors; cols++) {
    const rows = Math.ceil(doors / cols);
    const waste = cols * rows - doors;
    const squareness = Math.abs(Math.log((aspect * rows) / cols));
    const score = squareness + 0.15 * waste;
    if (score < bestScore) {
      bestScore = score;
      best = { cols, rows };
    }
  }
  return best;
}

export function AdventMode({ src, p, width, height, seed, settings, days }: ModeProps) {
  const v = clamp01(p);
  const doors = resolveDoors(settings.doors, days);
  const grid = useMemo(() => adventGrid(doors, width, height), [doors, width, height]);
  const cells = grid.cols * grid.rows;
  const layout = useMemo(() => permutation(cells, seed), [cells, seed]);
  const tiles = useMemo(() => makeTiles(width, height, grid), [width, height, grid]);

  if (v >= 1) {
    return (
      <Stage width={width} height={height}>
        <RevealImage src={src} width={width} height={height} />
      </Stage>
    );
  }
  const opened = Math.floor(v * doors + 1e-9);
  return (
    <Stage width={width} height={height} style={{ perspective: 600 }}>
      {tiles.map((t) => {
        // Cells beyond `doors` (grid padding) are unnumbered and open together with the last door.
        const num = layout[t.index] + 1;
        const extra = num > doors;
        const n = extra ? doors : num;
        const open = n <= opened;
        const next = n === opened + 1;
        return (
          // The door swings outside its cell, so the cell itself must not clip. The image is clipped
          // by its own inner box instead: an unclipped tile would show the whole image through it.
          <div
            key={t.index}
            data-testid="advent-cell"
            style={{
              position: 'absolute',
              left: t.x,
              top: t.y,
              width: t.w,
              height: t.h,
              transformStyle: 'preserve-3d',
            }}
          >
            <TileImage src={src} width={width} height={height} tile={t} style={{ left: 0, top: 0 }} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(135deg, #2a3a63, #1b2540)',
                border: '1px solid #3a4c7a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: Math.max(9, Math.min(18, Math.round(Math.min(t.w, t.h) * 0.3))),
                color: next ? '#fff' : '#c8d4ff',
                transformOrigin: 'left center',
                transition: 'transform .7s cubic-bezier(.4,.2,.2,1)',
                backfaceVisibility: 'hidden',
                transform: open ? 'rotateY(-125deg)' : 'none',
                boxShadow: next ? 'inset 0 0 0 2px #f2cc0c' : undefined,
                userSelect: 'none',
              }}
            >
              {extra ? '' : num}
            </div>
          </div>
        );
      })}
    </Stage>
  );
}

export const adventMode: ModeDefinition = {
  id: 'advent',
  name: 'Advent / Countdown doors',
  description:
    'One numbered door per day in a seeded layout; door n swings open on day n. The next door is highlighted. Calendar-style.',
  gifSafe: true,
  Component: AdventMode,
};
