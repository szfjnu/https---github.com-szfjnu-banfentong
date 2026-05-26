function linearRegression(points) {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 }

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += points[i]
    sumXY += i * points[i]
    sumX2 += i * i
    sumY2 += points[i] * points[i]
  }

  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 }

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  const ssTotal = sumY2 - (sumY * sumY) / n
  const ssResidual = ssTotal - slope * slope * (sumX2 - (sumX * sumX) / n)
  const r2 = ssTotal !== 0 ? 1 - ssResidual / ssTotal : 0

  return { slope, intercept, r2 }
}

function detectTurningPoints(points) {
  const turningPoints = []
  if (points.length < 5) return turningPoints

  for (let i = 2; i < points.length - 2; i++) {
    const leftSlope = points[i] - points[i - 2]
    const rightSlope = points[i + 2] - points[i]
    if ((leftSlope > 0 && rightSlope < 0) || (leftSlope < 0 && rightSlope > 0)) {
      turningPoints.push({
        index: i,
        value: points[i],
        type: leftSlope > 0 ? 'peak' : 'valley'
      })
    }
  }
  return turningPoints
}

function smoothData(points, windowSize = 3) {
  if (points.length < windowSize) return points
  const half = Math.floor(windowSize / 2)
  return points.map((_, i) => {
    const start = Math.max(0, i - half)
    const end = Math.min(points.length, i + half + 1)
    const slice = points.slice(start, end)
    return Math.round((slice.reduce((s, v) => s + v, 0) / slice.length) * 100) / 100
  })
}

function analyze(timeSeriesData) {
  if (!timeSeriesData || !Array.isArray(timeSeriesData) || timeSeriesData.length < 2) {
    return { direction: 'stable', rate: 0, turning_points: [], smoothed_data: [], regression: { slope: 0, intercept: 0, r2: 0 } }
  }

  const values = timeSeriesData.map(d => d.value !== undefined ? d.value : (d.score || d.count || 0))

  const regression = linearRegression(values)
  const turningPoints = detectTurningPoints(values)
  const smoothed = smoothData(values)

  let direction = 'stable'
  const avgValue = values.reduce((s, v) => s + Math.abs(v), 0) / values.length
  if (avgValue > 0) {
    const relativeSlope = regression.slope / avgValue
    if (relativeSlope > 0.05) direction = 'up'
    else if (relativeSlope < -0.05) direction = 'down'
  }

  const rate = Math.round(regression.slope * 100) / 100

  return {
    direction,
    rate,
    turning_points: turningPoints,
    smoothed_data: smoothed,
    regression: {
      slope: Math.round(regression.slope * 1000) / 1000,
      intercept: Math.round(regression.intercept * 100) / 100,
      r2: Math.round(regression.r2 * 1000) / 1000
    }
  }
}

module.exports = { analyze, linearRegression, detectTurningPoints, smoothData }
