// utils/index.js

// 引入同目录下的其他模块
const auth = require('./auth.js');
const transaction = require('./transaction.js');
const validator = require('./validator.js');

// 云函数统一入口
exports.main = async (event, context) => {
  const { type, data } = event; // 假设小程序端传过来 type 和 data

  switch (type) {
    case 'login':
    case 'auth':
      return await auth.main(event, context); // 假设 auth.js 里有 main 方法
      break;
      
    case 'transaction':
      return await transaction.main(event, context);
      break;

    case 'validate':
      return await validator.main(event, context);
      break;

    default:
      return {
        code: -1,
        msg: '未知的调用类型 type'
      };
  }
};