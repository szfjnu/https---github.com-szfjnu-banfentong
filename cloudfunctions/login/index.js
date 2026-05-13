// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
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

  if (action === 'ensureUser') {
    try {
      const { nickname, avatarUrl, phone } = event.data || {}

      const existRes = await db.collection('users')
        .where({ _openid: openid })
        .limit(1)
        .get()

      if (existRes.data && existRes.data.length > 0) {
        const existingUser = existRes.data[0]
        const updateData = { updated_at: db.serverDate(), last_login: db.serverDate() }
        if (nickname) updateData.nickname = nickname
        if (avatarUrl) updateData.avatarUrl = avatarUrl
        if (phone) updateData.phone = phone

        await db.collection('users').doc(existingUser._id).update({ data: updateData })

        return {
          success: true,
          openid,
          userId: existingUser._id,
          isNew: false,
          user: { ...existingUser, ...updateData }
        }
      }

      const newUser = {
        _openid: openid,
        user_openid: openid,
        openid: openid,
        role: 'user',
        nickname: nickname || '微信用户',
        avatarUrl: avatarUrl || '',
        phone: phone || '',
        phone_verified: !!phone,
        is_active: true,
        membership: {
          level: 1,
          is_advanced: false,
          type: 'free'
        },
        membership_usage: {},
        membership_permissions: {},
        last_login: db.serverDate(),
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }

      const addRes = await db.collection('users').add({ data: newUser })

      return {
        success: true,
        openid,
        userId: addRes._id,
        isNew: true,
        user: { ...newUser, _id: addRes._id }
      }
    } catch (err) {
      console.error('ensureUser失败:', err)
      return { success: false, message: err.message || '用户初始化失败', openid }
    }
  }

  if (action === 'initUserMembership') {
    try {
      const existRes = await db.collection('users')
        .where({ _openid: openid })
        .limit(1)
        .get()

      if (existRes.data && existRes.data.length > 0) {
        const user = existRes.data[0]
        if (!user.membership || !user.membership.level) {
          await db.collection('users').doc(user._id).update({
            data: {
              membership: {
                level: 1,
                is_advanced: false,
                type: 'free'
              },
              updated_at: db.serverDate()
            }
          })
        }
        return { success: true, isNew: false }
      }

      const newUser = {
        _openid: openid,
        user_openid: openid,
        openid: openid,
        role: 'user',
        nickname: '微信用户',
        is_active: true,
        membership: {
          level: 1,
          is_advanced: false,
          type: 'free'
        },
        membership_usage: {},
        membership_permissions: {},
        last_login: db.serverDate(),
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }

      await db.collection('users').add({ data: newUser })
      return { success: true, isNew: true }
    } catch (err) {
      console.error('initUserMembership失败:', err)
      return { success: false, message: err.message || '初始化失败' }
    }
  }

  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID
  }
}
