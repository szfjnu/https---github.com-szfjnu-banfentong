/**
 * 同步共享模块到各云函数
 * 
 * 微信云开发每个云函数独立部署，不支持跨目录require。
 * 此脚本将 cloudfunctions/common/ 下的共享模块实体复制到
 * 各云函数对应目录中，替换薄代理文件。
 * 
 * 用法：node scripts/sync-common-modules.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMMON_DIR = path.join(ROOT, 'cloudfunctions', 'common');
const CF_DIR = path.join(ROOT, 'cloudfunctions');

const SYNC_MAP = {
  'auth/index.js': 'utils/auth.js',
  'growth-utils/index.js': 'utils/growth-utils.js',
  'growth-utils/format.js': 'utils/growth-format.js'
};

function getCloudFunctions() {
  return fs.readdirSync(CF_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'common' && d.name !== 'utils')
    .map(d => d.name);
}

function syncModule(sourceRelPath, targetRelPath) {
  const sourcePath = path.join(COMMON_DIR, sourceRelPath);
  if (!fs.existsSync(sourcePath)) {
    console.error(`  [SKIP] 源文件不存在: ${sourcePath}`);
    return 0;
  }

  const sourceContent = fs.readFileSync(sourcePath, 'utf-8');
  const fns = getCloudFunctions();
  let count = 0;

  for (const fn of fns) {
    const targetPath = path.join(CF_DIR, fn, targetRelPath);
    const targetDir = path.dirname(targetPath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.writeFileSync(targetPath, sourceContent, 'utf-8');
    count++;
    console.log(`  [OK] ${fn}/${targetRelPath}`);
  }

  return count;
}

console.log('=== 同步共享模块到云函数 ===\n');

for (const [source, target] of Object.entries(SYNC_MAP)) {
  console.log(`同步 ${source} → ${target}:`);
  const count = syncModule(source, target);
  console.log(`  共 ${count} 个云函数已同步\n`);
}

console.log('=== 同步完成 ===');
