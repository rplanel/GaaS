import type { Sequence } from '../types/sequenceBrowser'

export function generateSequences(count: number): Sequence[] {
  const sequences: Sequence[] = []
  let currentPosition = 0
  const gap = 50 // Minimum gap between sequences

  for (let i = 0; i < count; i++) {
    // Random length between 100 and 500
    const length = Math.floor(Math.random() * 401) + 100
    const start = currentPosition
    const end = start + length

    // Randomly assign strand: 40% +1, 40% -1, 20% undefined
    const rand = Math.random()
    let strand: 1 | -1 | undefined
    if (rand < 0.4) {
      strand = 1
    }
    else if (rand < 0.8) {
      strand = -1
    }
    else {
      strand = undefined
    }

    // Determine prefix based on strand
    let prefix: string
    let namePrefix: string
    if (strand === 1) {
      prefix = 'gene-pos'
      namePrefix = 'Gene +'
    }
    else if (strand === -1) {
      prefix = 'gene-neg'
      namePrefix = 'Gene -'
    }
    else {
      prefix = 'feature'
      namePrefix = 'Feature'
    }

    sequences.push({
      id: `${prefix}-${String(i + 1).padStart(4, '0')}`,
      name: `${namePrefix} ${i + 1}`,
      length,
      start,
      end,
      strand,
    })

    // Move position for next sequence (current end + gap)
    currentPosition = end + gap
  }

  return sequences
}
