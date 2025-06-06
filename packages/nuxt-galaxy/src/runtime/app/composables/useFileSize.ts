import type { ComputedRef, MaybeRef } from 'vue'
import { computed, toValue } from 'vue'

/**
 * A composable function to format file sizes in a human-readable format.
 * It takes a number of bytes and returns a formatted string with appropriate units.
 *
 * @param {MaybeRef<number | undefined>} bytesRef - A reference to the number of bytes.
 * @returns {{fileSize: ComputedRef<string | undefined>}} An object containing the formatted file size.
 */
export function useFileSize(bytesRef: MaybeRef<number | undefined>): {
  fileSize: ComputedRef<string | undefined>
} {
  const fileSize = computed(() => {
    let bytes = toValue(bytesRef)
    if (bytes) {
      const thresh = 1024
      if (Math.abs(bytes) < thresh) {
        return `${bytes} B`
      }
      const units = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
      let u = -1
      do {
        bytes /= thresh
        ++u
      } while (Math.abs(bytes) >= thresh && u < units.length - 1)
      return `${bytes.toFixed(1)} ${units[u]}`
    }
    if (bytes === 0)
      return `${bytes} B`
  })
  return { fileSize }
}
