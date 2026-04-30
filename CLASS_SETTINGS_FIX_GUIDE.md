# 班级设置数据修复指南

## 问题分析

### 发现的问题

1. **无效数据存在**
   - `class_settings` 集合中存在 `class_id` 为空字符串的记录
   - 这些记录无法关联到任何班级，属于无效数据

2. **数据不完整**
   - 部分班级的 `class_settings` 记录缺少 `feature_flags` 字段
   - 导致宿舍管理功能开关无法正常读取

3. **跳转参数缺失**
   - `dorm.js` 中跳转到班级设置页面时未传递 `class_id` 参数
   - 导致页面无法正确加载和保存班级设置

### 数据库中的问题数据

```javascript
// 第一条：缺少 feature_flags
{
  "_id": "93abbbd769c54d7e01ba1c825f807566",
  "class_id": "dde8ef4869bcdadf00df0a27064efcbe",
  "volunteer_score_per_hour": 1,
  // ❌ 缺少 feature_flags
}

// 第二条：class_id 为空
{
  "_id": "8d2e20b369cee2b902afb8c15bed0edf",
  "class_id": "",  // ❌ 空字符串
  "feature_flags": {
    "enable_dorm": true
  }
}
```

## 解决方案

### 1. 部署云函数

#### 步骤 1：创建云函数
云函数已创建在 `cloudfunctions/fixClassSettings/` 目录下。

#### 步骤 2：上传并部署云函数
1. 打开微信开发者工具
2. 右键点击 `cloudfunctions/fixClassSettings` 文件夹
3. 选择"上传并部署：云端安装依赖"
4. 等待部署完成

### 2. 执行修复

#### 方法一：在微信小程序中调用
在任意页面的 JS 文件中添加以下代码：

```javascript
// 调用修复云函数
wx.cloud.callFunction({
  name: 'fixClassSettings',
  success: res => {
    console.log('修复结果:', res.result)
    if (res.result.success) {
      wx.showModal({
        title: '修复成功',
        content: JSON.stringify(res.result.stats, null, 2),
        showCancel: false
      })
    } else {
      wx.showModal({
        title: '修复失败',
        content: res.result.message,
        showCancel: false
      })
    }
  },
  fail: err => {
    console.error('调用云函数失败:', err)
    wx.showToast({
      title: '调用失败',
      icon: 'none'
    })
  }
})
```

#### 方法二：在云开发控制台测试
1. 打开微信开发者工具
2. 进入"云开发"控制台
3. 点击"云函数"
4. 找到 `fixClassSettings` 云函数
5. 点击"测试"按钮
6. 点击"调用"按钮执行

### 3. 云函数功能说明

云函数 `fixClassSettings` 会执行以下操作：

1. **清理无效数据**
   - 删除所有 `class_id` 为空、null 或 undefined 的记录

2. **检查所有活跃班级**
   - 查询所有状态不是 'graduated' 的班级

3. **创建或更新班级设置**
   - 为每个班级创建 `class_settings` 记录
   - 如果记录已存在，更新缺失的字段
   - 确保每个班级都有完整的 `feature_flags` 配置

4. **返回修复统计**
   - 删除的无效记录数
   - 更新的记录数
   - 新建的记录数
   - 总记录数

### 4. 代码修复

已修复的代码文件：

#### `miniprogram/pages/dorm/dorm.js`
```javascript
// 修复前
goToSettings: function () {
  wx.navigateTo({
    url: '/pages/class/settings/settings'
  });
},

// 修复后
goToSettings: function () {
  wx.navigateTo({
    url: `/pages/class/settings/settings?id=${this.data.classId}`
  });
},
```

#### `miniprogram/pages/class/settings/settings.js`
- 修改 `loadData` 方法：从 `class_settings` 集合读取设置
- 修改 `onToggleSetting` 方法：保存设置到 `class_settings` 集合
- 修复数据同步问题

## 执行修复后的效果

### 修复前的数据
```javascript
// 2条记录，1条无效，1条不完整
[
  {
    "_id": "93abbbd769c54d7e01ba1c825f807566",
    "class_id": "dde8ef4869bcdadf00df0a27064efcbe",
    // 缺少 feature_flags
  },
  {
    "_id": "8d2e20b369cee2b902afb8c15bed0edf",
    "class_id": "",  // 无效
    "feature_flags": { ... }
  }
]
```

### 修复后的数据
```javascript
// 假设有3个活跃班级，会生成3条完整记录
[
  {
    "_id": "93abbbd769c54d7e01ba1c825f807566",
    "class_id": "dde8ef4869bcdadf00df0a27064efcbe",
    "volunteer_score_per_hour": 2,
    "score_rules": {
      "max_score_per_day": -1,
      "min_score_per_action": 1,
      "score_expire_days": -1
    },
    "feature_flags": {
      "enable_volunteer": true,
      "enable_dorm": false,  // ✅ 完整
      "enable_competition": false,
      "enable_duty": true
    },
    "notification_settings": {
      "remind_before_days": 1,
      "notify_on_birthday": true,
      "notify_on_schedule": true
    }
  },
  // 其他班级的设置...
]
```

## 验证修复结果

### 1. 检查数据库
在云开发控制台查询 `class_settings` 集合：
```javascript
db.collection('class_settings').get()
```

确保：
- 没有 `class_id` 为空的记录
- 每个活跃班级都有对应的记录
- 每条记录都有完整的 `feature_flags` 字段

### 2. 测试宿舍管理功能
1. 进入班级管理页面
2. 点击某个班级的"设置"
3. 打开"宿舍管理"开关
4. 点击"保存"
5. 返回首页
6. 点击"宿舍管理"
7. 应该能正常进入宿舍管理页面

### 3. 查看设置是否保存
在班级设置页面，关闭"宿舍管理"开关，保存后再打开，应该能保持设置状态。

## 常见问题

### Q: 云函数执行失败怎么办？
A: 检查以下几点：
1. 云函数是否正确部署
2. 云环境是否正确配置
3. 云函数是否有足够的权限操作数据库

### Q: 修复后功能还是不正常？
A: 检查以下几点：
1. 小程序代码是否已保存并重新编译
2. 是否清除了缓存
3. `app.globalData.class_id` 是否正确设置

### Q: 如何手动清理无效数据？
A: 在云开发控制台执行：
```javascript
db.collection('class_settings').where({
  class_id: _.in(['', null, undefined])
}).remove()
```

## 总结

通过以上步骤，可以完全解决班级设置数据的问题：

1. ✅ 清理无效数据
2. ✅ 为所有班级创建完整的设置记录
3. ✅ 修复代码中的跳转参数问题
4. ✅ 确保宿舍管理功能正常工作

修复完成后，宿舍管理功能应该能够正常使用，不会再出现"提示需要开启"或"一直加载中"的问题。
