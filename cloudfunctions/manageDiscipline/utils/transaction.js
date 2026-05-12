const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

let _transactionAvailable = null

function isTransactionAvailable() {
  if (_transactionAvailable !== null) {
    return _transactionAvailable
  }
  try {
    const db = cloud.database()
    _transactionAvailable = typeof db.startTransaction === 'function'
  } catch (e) {
    _transactionAvailable = false
  }
  return _transactionAvailable
}

async function withTransaction(fn) {
  if (isTransactionAvailable()) {
    const db = cloud.database()
    const transaction = await db.startTransaction()
    try {
      const result = await fn(transaction)
      await transaction.commit()
      return result
    } catch (err) {
      try { await transaction.rollback() } catch (rbErr) { /* ignore rollback error */ }
      throw err
    }
  } else {
    return await withOptimisticLock(fn)
  }
}

async function withOptimisticLock(fn, maxRetries) {
  maxRetries = maxRetries || 3
  const db = cloud.database()
  let lastError

  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fn(db)
      return result
    } catch (err) {
      lastError = err
      if (i < maxRetries - 1) {
        const delay = 50 + Math.floor(Math.random() * 200)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

async function batchWithIndependentTransaction(items, fn) {
  const results = []
  const failures = []
  let successCount = 0
  let failureCount = 0

  for (const item of items) {
    try {
      const result = await withTransaction(tx => fn(tx, item))
      results.push(result)
      successCount++
    } catch (err) {
      failures.push({ item, error: err.message })
      failureCount++
    }
  }

  return { successCount, failureCount, results, failures }
}

module.exports = {
  withTransaction,
  batchWithIndependentTransaction,
  withOptimisticLock,
  isTransactionAvailable
}
