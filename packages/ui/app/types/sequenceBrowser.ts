export type Strand = 1 | -1

export interface Sequence {
  id: string
  name: string
  length: number
  strand?: Strand
  start?: number
  end?: number
}

export interface SequenceCluster {
  id: string
  name: string
  type: 'cluster'
  start: number
  end: number
  count: number
  sequences: Sequence[]
}
