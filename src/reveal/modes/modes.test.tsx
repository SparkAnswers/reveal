import React from 'react';
import { render } from '@testing-library/react';
import { RevealMode } from '../../types';
import { ModeProps } from '../types';
import { MODES, getMode } from './index';

const SRC = 'data:image/png;base64,iVBORw0KGgo=';
const GIF_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

const ALL_IDS: RevealMode[] = [
  'fade',
  'blur',
  'pixelate',
  'jigsaw',
  'shuffle',
  'wipe',
  'iris',
  'scratch',
  'blinds',
  'mosaic',
  'brightness',
  'color',
  'advent',
  'puzzle',
  'combo',
  'instant',
];

function renderMode(id: RevealMode, over: Partial<ModeProps> = {}) {
  const C = getMode(id).Component;
  return render(<C {...props(over)} />);
}

function props(over: Partial<ModeProps> = {}): ModeProps {
  return {
    src: SRC,
    p: 0.5,
    width: 320,
    height: 200,
    seed: 1234,
    settings: {},
    isGif: false,
    days: 30,
    ...over,
  };
}

describe('MODES registry', () => {
  it('contains every mode exactly once, in RevealMode order', () => {
    expect(MODES.map((m) => m.id)).toEqual(ALL_IDS);
    MODES.forEach((m) => {
      expect(m.name).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(typeof m.gifSafe).toBe('boolean');
      expect(m.Component).toBeDefined();
    });
  });

  it('getMode finds modes and falls back to blur', () => {
    expect(getMode('advent').id).toBe('advent');
    expect(getMode('nope' as RevealMode).id).toBe('blur');
  });
});

describe.each(MODES.map((m) => [m.id, m] as const))('mode %s', (_id, mode) => {
  const { Component } = mode;

  it.each([
    [0, false],
    [0.5, false],
    [1, false],
    [0, true],
    [0.5, true],
    [1, true],
  ])('renders without throwing at p=%d (isGif=%s)', (p, isGif) => {
    const src = isGif ? GIF_SRC : SRC;
    const { container, unmount } = render(<Component {...props({ p, isGif, src })} />);
    expect(container.firstChild).toBeTruthy();
    unmount();
  });

  it('shows the plain <img> with the src at p=1', () => {
    const { container } = render(<Component {...props({ p: 1 })} />);
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute('src')).toBe(SRC);
    expect(imgs[0].style.objectFit).toBe('cover');
    expect(imgs[0].style.filter).toBe('');
    expect(imgs[0].style.opacity).toBe('');
    expect(imgs[0].style.clipPath).toBe('');
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('updates in place from p=0 to p=0.5 to p=1 without throwing', () => {
    const { rerender } = render(<Component {...props({ p: 0 })} />);
    rerender(<Component {...props({ p: 0.5 })} />);
    rerender(<Component {...props({ p: 1 })} />);
  });

  it('honours custom grid / direction / doors / combo settings', () => {
    render(
      <Component
        {...props({
          p: 0.4,
          settings: {
            grid: { cols: 3, rows: 2 },
            direction: 'center',
            doors: 7,
            combo: ['blur', 'wipe', 'fade'],
            blurMaxPx: 10,
            pixelMaxSize: 12,
          },
        })}
      />
    );
  });

  it('is deterministic for the same seed', () => {
    const a = render(<Component {...props({ p: 0.37, seed: 99 })} />).container.innerHTML;
    const b = render(<Component {...props({ p: 0.37, seed: 99 })} />).container.innerHTML;
    // useId differs between renders in scratch/puzzle; normalise ids.
    const norm = (s: string) => s.replace(/(scr|foil|pz)-[^"'#)\s]+/g, '$1-X');
    expect(norm(a)).toBe(norm(b));
  });
});

describe('combo', () => {
  it('falls back to the default stack when no selected layer can be composed', () => {
    const { container } = renderMode('combo', { p: 0, settings: { combo: ['jigsaw'] } });
    const el = container.querySelector('canvas, img') as HTMLElement;
    expect(el).toBeTruthy();
    // The image must not be the plain, unfiltered <img>.
    expect(el.tagName === 'CANVAS' || el.style.filter !== '').toBe(true);
  });
});

describe('p = 0 is unrecognizable', () => {
  it('fade is fully transparent', () => {
    const { container } = renderMode('fade', { p: 0 });
    expect(container.querySelector('img')!.style.opacity).toBe('0');
  });

  it('jigsaw / puzzle / mosaic show no image tiles', () => {
    for (const id of ['jigsaw', 'mosaic'] as RevealMode[]) {
      const { container } = renderMode(id, { p: 0 });
      expect(container.querySelectorAll('img').length).toBe(0);
    }
    const { container } = renderMode('puzzle', { p: 0 });
    expect(container.querySelectorAll('image').length).toBe(0);
  });

  it('advent has every door closed and door 1 highlighted', () => {
    const { container } = renderMode('advent', { p: 0, days: 12 });
    expect(container.textContent).toContain('1');
    const panels = Array.from(container.querySelectorAll('div')).filter(
      (d) => d.style.transformOrigin === 'left center'
    );
    expect(panels.length).toBeGreaterThanOrEqual(12);
    panels.forEach((d) => expect(d.style.transform).toBe('none'));
  });

  it('advent clips every copy of the image to its own cell, so closed doors hide it', () => {
    const { container } = renderMode('advent', { p: 0.3, days: 12 });
    const imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs.length).toBeGreaterThanOrEqual(12);
    imgs.forEach((img) => {
      const box = img.parentElement!;
      expect(box.style.overflow).toBe('hidden');
      // The clip box is exactly one cell, not the whole stage.
      expect(parseFloat(box.style.width)).toBeLessThan(320);
      expect(parseFloat(box.style.height)).toBeLessThan(200);
    });
  });
});

describe('instant', () => {
  it('renders nothing before p = 1 and the plain image at p = 1', () => {
    const hidden = renderMode('instant', { p: 0.99 });
    expect(hidden.container.querySelector('img')).toBeNull();
    const shown = renderMode('instant', { p: 1 });
    expect(shown.container.querySelector('img')).not.toBeNull();
  });
});
