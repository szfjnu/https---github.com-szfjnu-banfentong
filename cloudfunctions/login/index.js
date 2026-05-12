// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action } = event

  if (action === 'getPhoneNumber') {
    try {
      const openData = await cloud.getOpenData({
        list: [event.cloudID_phone]
      })
      const phoneInfo = openData.list[0].data
      return {
        success: true,
        phoneNumber: phoneInfo.phoneNumber,
        purePhoneNumber: phoneInfo.purePhoneNumber,
        countryCode: phoneInfo.countryCode
      }
    } catch (err) {
      console.error('获取手机号失败:', err)
      return {
        success: false,
        message: '手机号解密失败'
      }
    }
  }

  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID
  }
}
