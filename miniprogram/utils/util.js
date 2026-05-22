// utils/util.js
// 通用工具函数库

/**
 * 格式化日期
 * @param {Date} date 日期对象
 * @param {String} format 格式字符串
 * @returns {String} 格式化后的日期字符串
 */
const formatDate = (date, format = 'YYYY-MM-DD') => {
  if (!date) return '';

  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  const second = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second);
};

/**
 * 格式化时间
 * @param {Date} date 日期对象
 * @returns {String} 格式化后的时间字符串
 */
const formatTime = (date) => {
  return formatDate(date, 'YYYY-MM-DD HH:mm:ss');
};

/**
 * 格式化日期时间（简短格式）
 * @param {Date} date 日期对象
 * @returns {String} 格式化后的日期时间字符串
 */
const formatDateTime = (date) => {
  return formatDate(date, 'YYYY-MM-DD HH:mm');
};

/**
 * 获取相对时间描述
 * @param {Date} date 日期对象
 * @returns {String} 相对时间描述
 */
const getRelativeTime = (date) => {
  const now = new Date();
  const d = new Date(date);
  const diff = now - d;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (diff < minute) {
    return '刚刚';
  } else if (diff < hour) {
    return Math.floor(diff / minute) + '分钟前';
  } else if (diff < day) {
    return Math.floor(diff / hour) + '小时前';
  } else if (diff < week) {
    return Math.floor(diff / day) + '天前';
  } else if (diff < month) {
    return Math.floor(diff / week) + '周前';
  } else {
    return formatDate(date, 'YYYY-MM-DD');
  }
};

/**
 * 显示加载提示
 * @param {String} title 提示文字
 */
const showLoading = (title = '加载中...') => {
  wx.showLoading({
    title: title,
    mask: true
  });
};

/**
 * 隐藏加载提示
 */
const hideLoading = () => {
  wx.hideLoading();
};

/**
 * 显示成功提示
 * @param {String} title 提示文字
 */
const showSuccess = (title) => {
  wx.showToast({
    title: title,
    icon: 'success',
    duration: 2000
  });
};

/**
 * 显示错误提示
 * @param {String} title 提示文字
 */
const showError = (title) => {
  wx.showToast({
    title: title,
    icon: 'error',
    duration: 2000
  });
};

/**
 * 显示普通提示
 * @param {String} title 提示文字
 */
const showInfo = (title) => {
  wx.showToast({
    title: title,
    icon: 'none',
    duration: 2000
  });
};

/**
 * 显示确认对话框
 * @param {String} content 对话框内容
 * @param {String} title 对话框标题
 * @returns {Promise} 用户选择结果
 */
const showConfirm = (content, title = '提示') => {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: title,
      content: content,
      success: (res) => {
        if (res.confirm) {
          resolve(true);
        } else {
          resolve(false);
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

/**
 * 防抖函数
 * @param {Function} fn 需要防抖的函数
 * @param {Number} delay 延迟时间(毫秒)
 * @returns {Function} 防抖后的函数
 */
const debounce = (fn, delay = 500) => {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
};

/**
 * 节流函数
 * @param {Function} fn 需要节流的函数
 * @param {Number} delay 延迟时间(毫秒)
 * @returns {Function} 节流后的函数
 */
const throttle = (fn, delay = 500) => {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime > delay) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
};

/**
 * 深拷贝对象
 * @param {Object} obj 需要拷贝的对象
 * @returns {Object} 拷贝后的对象
 */
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj);
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }

  if (obj instanceof Object) {
    const copy = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        copy[key] = deepClone(obj[key]);
      }
    }
    return copy;
  }

  return obj;
};

/**
 * 生成唯一ID
 * @returns {String} 唯一ID
 */
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

/**
 * 验证手机号
 * @param {String} phone 手机号
 * @returns {Boolean} 是否有效
 */
const isValidPhone = (phone) => {
  return /^1[3-9]\d{9}$/.test(phone);
};

/**
 * 验证邮箱
 * @param {String} email 邮箱
 * @returns {Boolean} 是否有效
 */
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * 验证身份证号
 * @param {String} idCard 身份证号
 * @returns {Boolean} 是否有效
 */
const isValidIdCard = (idCard) => {
  return /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/.test(idCard);
};

/**
 * 获取积分等级
 * @param {Number} score 积分
 * @returns {String} 积分等级
 */
const getScoreLevel = (score) => {
  if (score >= 95) return '优秀';
  if (score >= 85) return '良好';
  if (score >= 70) return '合格';
  if (score >= 60) return '待改进';
  return '不合格';
};

/**
 * 获取积分等级颜色
 * @param {Number} score 积分
 * @returns {String} 颜色值
 */
const getScoreColor = (score) => {
  if (score >= 95) return '#52c41a'; // 绿色
  if (score >= 85) return '#1890ff'; // 蓝色
  if (score >= 70) return '#faad14'; // 橙色
  if (score >= 60) return '#fa8c16'; // 深橙色
  return '#f5222d'; // 红色
};

/**
 * 计算年龄
 * @param {Date} birthday 出生日期
 * @returns {Number} 年龄
 */
const calculateAge = (birthday) => {
  const today = new Date();
  const birth = new Date(birthday);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
};

/**
 * 格式化文件大小
 * @param {Number} bytes 字节数
 * @returns {String} 格式化后的文件大小
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
};

const formatScore = (value) => {
  if (value === null || value === undefined || value === '' || isNaN(value) || !isFinite(value)) {
    return '0.00';
  }
  return Number(value).toFixed(2);
};

module.exports = {
  formatDate,
  formatTime,
  formatDateTime,
  getRelativeTime,
  showLoading,
  hideLoading,
  showSuccess,
  showError,
  showInfo,
  showConfirm,
  debounce,
  throttle,
  deepClone,
  generateId,
  isValidPhone,
  isValidEmail,
  isValidIdCard,
  getScoreLevel,
  getScoreColor,
  calculateAge,
  formatFileSize,
  formatScore
};
