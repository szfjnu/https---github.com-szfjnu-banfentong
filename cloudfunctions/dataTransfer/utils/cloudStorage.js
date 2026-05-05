const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

async function download(fileID) {
  const res = await cloud.downloadFile({ fileID })
  return res.fileContent
}

async function upload(buffer, fileName) {
  const now = new Date()
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('')
  const cloudPath = `dataTransfer/export/${dateStr}/${fileName}`
  const res = await cloud.uploadFile({ cloudPath, fileContent: buffer })
  return { fileID: res.fileID }
}

async function getDownloadURL(fileID) {
  const res = await cloud.getTempFileURL({ fileList: [fileID] })
  if (res.fileList && res.fileList.length > 0) {
    return res.fileList[0].tempFileURL
  }
  return null
}

module.exports = { download, upload, getDownloadURL }
