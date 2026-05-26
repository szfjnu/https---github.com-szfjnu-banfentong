function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length)
  if (n < 3) return 0

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0
  for (let i = 0; i < n; i++) {
    sumX += x[i]
    sumY += y[i]
    sumXY += x[i] * y[i]
    sumX2 += x[i] * x[i]
    sumY2 += y[i] * y[i]
  }

  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

  if (denominator === 0) return 0
  return numerator / denominator
}

function getSignificanceLevel(r, n) {
  const absR = Math.abs(r)
  if (n < 6) return 'insufficient'
  if (absR >= 0.7) return 'strong'
  if (absR >= 0.5) return 'moderate'
  if (absR >= 0.3) return 'weak'
  return 'negligible'
}

function analyze(dimensionData, options = {}) {
  if (!dimensionData || typeof dimensionData !== 'object') {
    return { correlations: [], significant_pairs: [], summary: { total_pairs: 0, significant_count: 0 } }
  }

  const threshold = options.threshold || 0.5
  const keys = Object.keys(dimensionData).filter(k => {
    const arr = dimensionData[k]
    return Array.isArray(arr) && arr.length >= 3
  })

  if (keys.length < 2) {
    return { correlations: [], significant_pairs: [], summary: { total_pairs: 0, significant_count: 0 } }
  }

  const correlations = []
  const significantPairs = []

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const keyA = keys[i]
      const keyB = keys[j]
      const dataA = dimensionData[keyA]
      const dataB = dimensionData[keyB]
      const n = Math.min(dataA.length, dataB.length)

      const r = pearsonCorrelation(dataA.slice(0, n), dataB.slice(0, n))
      const absR = Math.abs(r)
      const significance = getSignificanceLevel(r, n)
      const direction = r > 0 ? 'positive' : (r < 0 ? 'negative' : 'none')

      const result = {
        dimension_pair: [keyA, keyB],
        correlation: Math.round(r * 1000) / 1000,
        absolute_correlation: Math.round(absR * 1000) / 1000,
        is_significant: absR >= threshold,
        significance_level: significance,
        direction,
        sample_size: n
      }

      correlations.push(result)
      if (absR >= threshold) {
        significantPairs.push(result)
      }
    }
  }

  correlations.sort((a, b) => b.absolute_correlation - a.absolute_correlation)
  significantPairs.sort((a, b) => b.absolute_correlation - a.absolute_correlation)

  return {
    correlations,
    significant_pairs: significantPairs,
    summary: {
      total_pairs: correlations.length,
      significant_count: significantPairs.length,
      strongest: correlations.length > 0 ? correlations[0] : null
    }
  }
}

module.exports = { analyze, pearsonCorrelation }
