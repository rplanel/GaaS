export function countDecimals(value: number) {
  if (!Number.isFinite(value))
    return 0 // Check if the number is finite.

  const text = value.toString()
  // Check for scientific notation
  if (text.includes('e')) {
    const parts = text.split('e')
    if (parts.length >= 2 && parts[1] && parts[0]) {
      const exponent = Number.parseInt(parts[1], 10)
      const decimalParts = parts[0].split('.')
      if (decimalParts[1]) {
        const baseDecimals = decimalParts.length > 1 ? decimalParts[1].length : 0
        if (exponent < 0) {
          // Negative exponent: Increase the number of decimals
          return baseDecimals - exponent
        }
        else {
          // Positive exponent: Subtracts the base decimals from the exponent
          return Math.max(0, exponent - baseDecimals)
        }
      }
    }
  }

  // Normal decimal counting
  if (text.includes('.')) {
    const splittedText = text.split('.')
    if (splittedText[1]) {
      return splittedText[1].length
    }
  }

  return 0 // No decimal places if there's no decimal point
}
