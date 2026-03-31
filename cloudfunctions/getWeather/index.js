const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  // ⭐️ 配置你的高德 Web 服务 Key
  const KEY = 'b4ba21bc63351280fe02c09b35e084b0'; // 请确保这个 Key 在高德控制台开启了“Web服务”权限
  
  // 默认参数设置
  const city = event.city || '440100'; // 城市编码，默认广州
  const extensions = event.extensions || 'base'; // 数据模式，默认为实时天气 (base)，可选 'all' (预报)

  // 拼接请求地址
  const url = `https://restapi.amap.com/v3/weather/weatherInfo?key=${KEY}&city=${city}&extensions=${extensions}`;

  try {
    console.log('正在请求高德天气:', url); // 打印日志便于调试
    
    const res = await axios.get(url);

    // 高德成功响应时 status 为 "1"
    if (res.data.status === '1') {
      // 返回数据，根据 extensions 不同，data 结构会变
      // extensions=base 时，数据在 res.data.lives[0]
      // extensions=all 时，数据在 res.data.forecasts[0].casts
      return {
        success: true,
        data: res.data
      };
    } else {
      // 高德返回失败（如参数错误、服务不可用）
      console.error('高德天气 API 错误:', res.data);
      return {
        success: false,
        msg: '天气数据获取失败，请稍后重试',
        code: res.data.infocode, // 高德错误码
        detail: res.data.info    // 高德错误描述
      };
    }

  } catch (err) {
    // 网络请求异常（如超时、DNS解析失败）
    console.error('请求异常:', err);
    return {
      success: false,
      msg: '网络请求异常，请检查网络连接',
      error: err.message
    };
  }
};