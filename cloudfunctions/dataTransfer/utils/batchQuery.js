const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function getAllRecords(collection, query, orderByField, orderDirection) {
  const results = []
  let skip = 0
  const limit = 100
  let hasMore = true

  while (hasMore) {
    let queryRef = db.collection(collection).skip(skip).limit(limit)
    if (query) {
      queryRef = queryRef.where(query)
    }
    if (orderByField) {
      queryRef = queryRef.orderBy(orderByField, orderDirection || 'asc')
    }
    const { data } = await queryRef.get()
    results.push(...data)
    if (data.length < limit) {
      hasMore = false
    } else {
      skip += limit
    }
  }

  return results
}

module.exports = { getAllRecords }
