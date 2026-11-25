// Pixel icons drawn on a small grid ('#' = filled cell), rendered as crisp SVG rects so they
// match the blocky Switchyard logo. Each cell is 2px at the default size.
export const PIXEL_ICONS = {
  // Arrow entering a door frame.
  login: [
    '....####',
    '.......#',
    '..#....#',
    '...#...#',
    '#####..#',
    '...#...#',
    '..#....#',
    '....####',
  ],
  // Arrow leaving a door frame.
  logout: [
    '####....',
    '#.......',
    '#....#..',
    '#.....#.',
    '#..#####',
    '#.....#.',
    '#....#..',
    '####....',
  ],
  // Four tiles.
  dashboard: ['###.####', '###.####', '###.####', '........', '####.###', '####.###', '####.###'],
  play: ['##......', '####....', '######..', '########', '######..', '####....', '##......'],
  arrow: ['....#...', '.....#..', '......#.', '########', '......#.', '.....#..', '....#...'],
  // Ring with a centre dot.
  issue: [
    '..####..',
    '.#....#.',
    '#......#',
    '#..##..#',
    '#..##..#',
    '#......#',
    '.#....#.',
    '..####..',
  ],
} as const satisfies Record<string, readonly string[]>

export type PixelIconName = keyof typeof PIXEL_ICONS

export interface PixelRect {
  x: number
  y: number
  width: number
}

/** Turns a grid into one rect per horizontal run of filled cells. */
export function gridToRects(grid: readonly string[]): PixelRect[] {
  const rects: PixelRect[] = []
  grid.forEach((row, y) => {
    let start = -1
    for (let x = 0; x <= row.length; x++) {
      const filled = row[x] === '#'
      if (filled && start < 0) start = x
      if (!filled && start >= 0) {
        rects.push({ x: start, y, width: x - start })
        start = -1
      }
    }
  })
  return rects
}
