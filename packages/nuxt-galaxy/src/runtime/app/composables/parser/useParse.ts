import type { Ref } from 'vue'
import { computed, toValue } from 'vue'

export function useParse(text: Ref<string | undefined>) {
  const lines = computed(() => {
    const textVal = toValue(text)
    if (!textVal)
      return []
    return textVal.split('\n')
  })
  const comments = computed(() => {
    return lines.value.filter(line => line.trim() && line.startsWith('#'))
      .map(line => line.substring(1).trim()) // Remove # and trim
  })

  const results = computed(() => {
    const arr = lines.value.filter((line) => {
      const trimmedLine = line.trim()
      return trimmedLine && trimmedLine !== '' && !line.startsWith('#')
    })
    return arr.join('\n')
  })

  return {
    lines,
    comments,
    results,
  }
}
