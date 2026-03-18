export interface FileTypeInfo {
  icon: string
  color: string
  category: 'tabular' | 'sequence' | 'image' | 'text' | 'archive' | 'other'
}

const extensionMap: Record<string, FileTypeInfo> = {
  // Tabular data
  tabular: { icon: 'i-lucide-table', color: 'text-blue-500', category: 'tabular' },
  csv: { icon: 'i-lucide-table', color: 'text-blue-500', category: 'tabular' },
  tsv: { icon: 'i-lucide-table', color: 'text-blue-500', category: 'tabular' },
  interval: { icon: 'i-lucide-table', color: 'text-blue-500', category: 'tabular' },
  bed: { icon: 'i-lucide-table', color: 'text-blue-500', category: 'tabular' },
  bedgraph: { icon: 'i-lucide-table', color: 'text-blue-500', category: 'tabular' },
  gff: { icon: 'i-lucide-table', color: 'text-blue-500', category: 'tabular' },
  gff3: { icon: 'i-lucide-table', color: 'text-blue-500', category: 'tabular' },
  gtf: { icon: 'i-lucide-table', color: 'text-blue-500', category: 'tabular' },
  vcf: { icon: 'i-lucide-table', color: 'text-blue-500', category: 'tabular' },
  sam: { icon: 'i-lucide-table', color: 'text-blue-500', category: 'tabular' },
  maf: { icon: 'i-lucide-table', color: 'text-blue-500', category: 'tabular' },

  // Sequence data
  fasta: { icon: 'i-lucide-dna', color: 'text-green-500', category: 'sequence' },
  fastq: { icon: 'i-lucide-dna', color: 'text-green-500', category: 'sequence' },
  fastqsanger: { icon: 'i-lucide-dna', color: 'text-green-500', category: 'sequence' },
  genbank: { icon: 'i-lucide-dna', color: 'text-green-500', category: 'sequence' },
  embl: { icon: 'i-lucide-dna', color: 'text-green-500', category: 'sequence' },
  ab1: { icon: 'i-lucide-dna', color: 'text-green-500', category: 'sequence' },
  bam: { icon: 'i-lucide-dna', color: 'text-green-500', category: 'sequence' },

  // Images
  png: { icon: 'i-lucide-image', color: 'text-purple-500', category: 'image' },
  jpg: { icon: 'i-lucide-image', color: 'text-purple-500', category: 'image' },
  jpeg: { icon: 'i-lucide-image', color: 'text-purple-500', category: 'image' },
  svg: { icon: 'i-lucide-image', color: 'text-purple-500', category: 'image' },
  gif: { icon: 'i-lucide-image', color: 'text-purple-500', category: 'image' },
  tiff: { icon: 'i-lucide-image', color: 'text-purple-500', category: 'image' },
  pdf: { icon: 'i-lucide-file-text', color: 'text-red-500', category: 'image' },

  // Text / Structured
  txt: { icon: 'i-lucide-file-text', color: 'text-gray-500', category: 'text' },
  json: { icon: 'i-lucide-braces', color: 'text-amber-500', category: 'text' },
  xml: { icon: 'i-lucide-code', color: 'text-amber-500', category: 'text' },
  html: { icon: 'i-lucide-globe', color: 'text-orange-500', category: 'text' },
  nhx: { icon: 'i-lucide-git-branch', color: 'text-teal-500', category: 'text' },
  newick: { icon: 'i-lucide-git-branch', color: 'text-teal-500', category: 'text' },
  nex: { icon: 'i-lucide-git-branch', color: 'text-teal-500', category: 'text' },

  // Archive
  gz: { icon: 'i-lucide-archive', color: 'text-gray-500', category: 'archive' },
  bz2: { icon: 'i-lucide-archive', color: 'text-gray-500', category: 'archive' },
  zip: { icon: 'i-lucide-archive', color: 'text-gray-500', category: 'archive' },
  tar: { icon: 'i-lucide-archive', color: 'text-gray-500', category: 'archive' },
}

const defaultFileType: FileTypeInfo = {
  icon: 'i-lucide-file',
  color: 'text-gray-400',
  category: 'other',
}

export function getFileTypeInfo(extension: string | undefined | null): FileTypeInfo {
  if (!extension)
    return defaultFileType
  return extensionMap[extension.toLowerCase()] ?? defaultFileType
}
