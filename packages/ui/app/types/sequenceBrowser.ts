export type Strand = 1 | -1

export interface BaseSequence {
  id: string
  name: string
  start: number
  end: number
}

export interface Sequence extends BaseSequence {
  type: 'sequence'
  length: number
  strand: Strand
}

export interface SequenceCluster extends BaseSequence {
  type: 'cluster'
  count: number
  sequences: Sequence[]
}
