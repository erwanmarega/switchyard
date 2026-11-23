import { describe, it, expect } from 'vitest'
import { gridToRects, PIXEL_ICONS } from '../app/utils/pixel-icons'

describe('gridToRects', () => {
  it('merges horizontal runs into one rect each', () => {
    expect(gridToRects(['##.#', '....', '.###'])).toEqual([
      { x: 0, y: 0, width: 2 },
      { x: 3, y: 0, width: 1 },
      { x: 1, y: 2, width: 3 },
    ])
  })

  it('keeps every icon grid rectangular and non-empty', () => {
    for (const [name, grid] of Object.entries(PIXEL_ICONS)) {
      const width = grid[0]!.length
      expect(
        grid.every((row) => row.length === width),
        name,
      ).toBe(true)
      expect(gridToRects(grid).length, name).toBeGreaterThan(0)
    }
  })
})
