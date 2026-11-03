import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// These classes lay out their children in a row (justify-content, align-items and
// flex-wrap are set on them further down styles.css). Without display: flex the
// children run inline, so a song card read "1:31100 BPM" (duration glued to BPM).
const rowContainers = [
  'control-row',
  'panel-heading',
  'transport-buttons',
  'song-card-header',
  'song-card-meta',
  'results-actions',
  'view-toggle',
  'filter-chips',
];

// Same shared rule, but a later rule makes them grids on purpose.
const gridContainers = ['song-card-stats', 'timing-breakdown'];

describe('styles.css row containers', () => {
  let style: HTMLStyleElement;

  beforeAll(() => {
    style = document.createElement('style');
    style.textContent = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');
    document.head.append(style);
  });

  afterAll(() => {
    style.remove();
  });

  function displayOf(className: string): string {
    const el = document.createElement('div');
    el.className = className;
    document.body.append(el);
    const display = getComputedStyle(el).display;
    el.remove();
    return display;
  }

  it.each(rowContainers)('.%s is a flex container', (className) => {
    expect(displayOf(className)).toBe('flex');
  });

  it.each(gridContainers)('.%s stays a grid', (className) => {
    expect(displayOf(className)).toBe('grid');
  });
});
