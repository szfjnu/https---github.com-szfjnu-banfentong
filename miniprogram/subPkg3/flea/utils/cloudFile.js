function resolveCloudFile(fileID) {
  if (!fileID || typeof fileID !== 'string') return Promise.resolve('')
  if (fileID.startsWith('http://') || fileID.startsWith('https://')) return Promise.resolve(fileID)
  if (!fileID.startsWith('cloud://')) return Promise.resolve(fileID)
  return new Promise((resolve) => {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        if (res.fileList && res.fileList.length > 0 && res.fileList[0].tempFileURL) {
          resolve(res.fileList[0].tempFileURL)
        } else {
          resolve('')
        }
      },
      fail: () => resolve('')
    })
  })
}

function resolveCloudFiles(fileIDs) {
  if (!Array.isArray(fileIDs) || fileIDs.length === 0) return Promise.resolve([])
  const cloudItems = []
  const result = new Array(fileIDs.length).fill('')
  fileIDs.forEach((id, idx) => {
    if (!id || typeof id !== 'string') return
    if (id.startsWith('http://') || id.startsWith('https://')) {
      result[idx] = id
    } else if (id.startsWith('cloud://')) {
      cloudItems.push({ id, idx })
    } else {
      result[idx] = id
    }
  })
  if (cloudItems.length === 0) return Promise.resolve(result)
  return new Promise((resolve) => {
    wx.cloud.getTempFileURL({
      fileList: cloudItems.map(c => c.id),
      success: (res) => {
        if (res.fileList) {
          res.fileList.forEach((item, i) => {
            if (item.tempFileURL && cloudItems[i]) {
              result[cloudItems[i].idx] = item.tempFileURL
            }
          })
        }
        resolve(result)
      },
      fail: () => resolve(result)
    })
  })
}

module.exports = { resolveCloudFile, resolveCloudFiles }
