const membership = require('../../utils/membership')

function chooseExcelFile() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'xls', 'txt', 'csv'],
      success: (res) => {
        if (res.tempFiles && res.tempFiles.length > 0) {
          const file = res.tempFiles[0]
          resolve({ path: file.path, name: file.name, size: file.size })
        } else {
          reject(new Error('未选择文件'))
        }
      },
      fail: (err) => reject(err)
    })
  })
}

function uploadToCloud(filePath, cloudPath) {
  if (!cloudPath) {
    const ts = Date.now()
    const fileName = filePath.split('/').pop() || 'file'
    cloudPath = `dataTransfer/import/${ts}_${fileName}`
  }
  return wx.cloud.uploadFile({ cloudPath, filePath })
}

async function callDataTransfer(action, data) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'dataTransfer',
      data: { action, data }
    })
    if (res.result && res.result.success) {
      return res.result
    } else {
      const msg = (res.result && res.result.message) || '操作失败'
      throw new Error(msg)
    }
  } catch (err) {
    if (err.message && err.message.includes('cloud function')) {
      throw new Error('云函数调用失败，请检查网络')
    }
    throw err
  }
}

async function downloadExcel(fileID) {
  try {
    const urlRes = await wx.cloud.getTempFileURL({ fileList: [fileID] })
    if (!urlRes.fileList || !urlRes.fileList[0] || !urlRes.fileList[0].tempFileURL) {
      throw new Error('获取下载链接失败')
    }
    const downloadURL = urlRes.fileList[0].tempFileURL
    const downloadRes = await new Promise((resolve, reject) => {
      wx.downloadFile({
        url: downloadURL,
        success: resolve,
        fail: reject
      })
    })
    if (downloadRes.statusCode === 200) {
      await new Promise((resolve, reject) => {
        wx.openDocument({
          filePath: downloadRes.tempFilePath,
          fileType: 'xlsx',
          success: resolve,
          fail: reject
        })
      })
    } else {
      throw new Error('下载文件失败')
    }
  } catch (err) {
    throw new Error('导出文件下载失败: ' + err.message)
  }
}

function checkExportPermission() {
  try {
    const accessResult = membership.checkFeatureAccess('export_data')
    if (!accessResult.allowed) {
      return { allowed: false, reason: accessResult.reason || '数据导出功能仅限专业版及以上会员使用' }
    }
  } catch (e) {
    return { allowed: true, reason: '' }
  }
  return { allowed: true, reason: '' }
}

function checkScheduleExcelPermission() {
  return { allowed: true, reason: '' }
}

async function checkGradeExcelPermission(openid) {
  try {
    if (!openid) {
      return { allowed: true, reason: '' }
    }
    return { allowed: true, reason: '' }
  } catch (e) {
    console.error('checkGradeExcelPermission error:', e)
    return { allowed: true, reason: '' }
  }
}

function chooseGradeExcelFile() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'xls'],
      success: (res) => {
        if (res.tempFiles && res.tempFiles.length > 0) {
          const file = res.tempFiles[0]
          if (file.size > 2 * 1024 * 1024) {
            reject(new Error('文件大小不能超过2MB'))
            return
          }
          resolve({ path: file.path, name: file.name, size: file.size })
        } else {
          reject(new Error('未选择文件'))
        }
      },
      fail: (err) => reject(err)
    })
  })
}

module.exports = {
  chooseExcelFile,
  uploadToCloud,
  callDataTransfer,
  downloadExcel,
  checkExportPermission,
  checkScheduleExcelPermission,
  checkGradeExcelPermission,
  chooseGradeExcelFile
}
