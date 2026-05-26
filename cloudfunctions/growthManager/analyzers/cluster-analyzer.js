function distance(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2
  }
  return Math.sqrt(sum)
}

function initCentroids(data, k) {
  const centroids = []
  const used = new Set()
  for (let i = 0; i < k; i++) {
    let idx
    do { idx = Math.floor(Math.random() * data.length) } while (used.has(idx) && used.size < data.length)
    used.add(idx)
    centroids.push([...data[idx]])
  }
  return centroids
}

function assignClusters(data, centroids) {
  return data.map(point => {
    let minDist = Infinity, minIdx = 0
    for (let i = 0; i < centroids.length; i++) {
      const d = distance(point, centroids[i])
      if (d < minDist) { minDist = d; minIdx = i }
    }
    return minIdx
  })
}

function updateCentroids(data, assignments, k) {
  const newCentroids = Array.from({ length: k }, () => ({ sum: null, count: 0 }))
  for (let i = 0; i < data.length; i++) {
    const cluster = assignments[i]
    if (!newCentroids[cluster].sum) {
      newCentroids[cluster].sum = new Array(data[i].length).fill(0)
    }
    for (let j = 0; j < data[i].length; j++) {
      newCentroids[cluster].sum[j] += data[i][j]
    }
    newCentroids[cluster].count++
  }
  return newCentroids.map(c => {
    if (c.count === 0 || !c.sum) return null
    return c.sum.map(v => v / c.count)
  })
}

function computeInertia(data, assignments, centroids) {
  let inertia = 0
  for (let i = 0; i < data.length; i++) {
    if (centroids[assignments[i]]) {
      inertia += distance(data[i], centroids[assignments[i]]) ** 2
    }
  }
  return inertia
}

function findOptimalK(data, maxK = 5) {
  if (data.length < 4) return Math.min(2, data.length)
  const inertias = []
  for (let k = 2; k <= Math.min(maxK, data.length); k++) {
    const result = kMeans(data, k, 20)
    inertias.push({ k, inertia: result.inertia })
  }
  if (inertias.length < 2) return 3
  let maxDelta = 0, optimalK = 3
  for (let i = 1; i < inertias.length; i++) {
    const delta = inertias[i - 1].inertia - inertias[i].inertia
    if (delta > maxDelta) { maxDelta = delta; optimalK = inertias[i - 1].k }
  }
  return optimalK
}

function kMeans(data, k, maxIterations = 50) {
  if (!data || data.length === 0 || data.length < k) {
    return { centroids: [], assignments: [], inertia: 0, k }
  }

  let centroids = initCentroids(data, k)
  let assignments = new Array(data.length).fill(0)

  for (let iter = 0; iter < maxIterations; iter++) {
    const newAssignments = assignClusters(data, centroids)
    const newCentroids = updateCentroids(data, newAssignments, k)

    let converged = true
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i] !== newAssignments[i]) { converged = false; break }
    }
    assignments = newAssignments
    centroids = newCentroids.filter(c => c !== null)

    if (converged || centroids.length < k) break
  }

  const inertia = computeInertia(data, assignments, centroids)
  return { centroids, assignments, inertia, k }
}

const GROUP_LABELS = ['群体A', '群体B', '群体C', '群体D', '群体E']

function analyze(studentData, dimensionKeys, options = {}) {
  if (!studentData || studentData.length < 3) {
    return { clusters: [], summary: { total_students: 0, cluster_count: 0 }, can_analyze: false }
  }

  if (studentData.length < 10 && !options.forceCluster) {
    return { clusters: [], summary: { total_students: studentData.length, cluster_count: 0 }, can_analyze: false, reason: '班级人数不足10人，聚类分析可能不可靠' }
  }

  const points = studentData.map(s => {
    const scores = dimensionKeys.map(key => {
      const val = s.scores && s.scores[key] !== undefined ? s.scores[key] : 0
      return Math.max(0, Math.min(100, val))
    })
    return scores
  })

  const maxK = options.maxK || Math.min(5, Math.floor(studentData.length / 3))
  const optimalK = options.k || findOptimalK(points, maxK)
  const result = kMeans(points, optimalK)

  const clusters = []
  for (let i = 0; i < result.centroids.length; i++) {
    const members = []
    for (let j = 0; j < result.assignments.length; j++) {
      if (result.assignments[j] === i) {
        members.push({ student_id: studentData[j].student_id, student_name: studentData[j].student_name })
      }
    }

    const centroidScores = {}
    dimensionKeys.forEach((key, idx) => {
      centroidScores[key] = Math.round(result.centroids[i][idx] * 10) / 10
    })

    const strongDimensions = dimensionKeys
      .map((key, idx) => ({ key, value: result.centroids[i][idx] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map(d => d.key)

    clusters.push({
      group_label: GROUP_LABELS[i] || `群体${i + 1}`,
      member_count: members.length,
      centroid_scores: centroidScores,
      strong_dimensions: strongDimensions,
      description: `${GROUP_LABELS[i] || '群体' + (i + 1)}：${members.length}人，${strongDimensions.join('、')}维度突出`
    })
  }

  return {
    clusters,
    summary: { total_students: studentData.length, cluster_count: clusters.length, inertia: result.inertia },
    can_analyze: true
  }
}

module.exports = { analyze, kMeans, findOptimalK }
