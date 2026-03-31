const { generateKeyPairSync } = require('crypto');

// 生成 Ed25519 密钥对
const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  format: 'pem',
  type: 'spki', // 公钥格式
});

console.log('【公钥】（复制到和风天气后台）：\n', publicKey.toString());
console.log('【私钥】（保存到云函数配置）：\n', privateKey.toString());