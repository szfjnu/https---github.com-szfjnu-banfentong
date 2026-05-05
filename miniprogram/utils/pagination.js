const DEFAULT_PAGE_SIZE = 20

function resetPagination() {
  return {
    pageIndex: 0,
    hasMore: true,
    loadingMore: false,
    pageSize: DEFAULT_PAGE_SIZE
  }
}

function checkHasMore(newDataLength, pageSize) {
  return newDataLength === pageSize
}

function appendData(existingList, newData, isRefresh) {
  if (isRefresh) return newData || []
  return (existingList || []).concat(newData || [])
}

function guardLoadMore(hasMore, loadingMore) {
  return !hasMore || loadingMore
}

async function callCloudFunctionForAll(funcName, action, params) {
  try {
    const res = await wx.cloud.callFunction({
      name: funcName,
      data: { action, data: params }
    })
    if (res.result && res.result.success) {
      return res.result.data || res.result
    }
    throw new Error((res.result && res.result.message) || '请求失败')
  } catch (err) {
    console.error(`云函数${funcName}调用失败:`, err)
    throw err
  }
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  resetPagination,
  checkHasMore,
  appendData,
  guardLoadMore,
  callCloudFunctionForAll
}
