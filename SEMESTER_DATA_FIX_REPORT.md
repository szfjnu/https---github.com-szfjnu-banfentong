# 学期数据缺失问题修复报告

**修复时间**: 2026-04-14  
**问题描述**: 创建分组时，`student_groups` 集合中的 `semester_id` 和 `semester_name` 字段值为空

---

## 🔍 问题分析

### 根本原因

通过代码排查，发现问题出在以下几个层面：

1. **`app.js` 全局数据定义缺失**
   - `globalData` 中没有定义 `currentSemesterName` 字段
   - `globalData` 中没有定义 `currentClassName` 字段

2. **`app.js` 的 `getCurrentSemester` 函数不完整**
   - 函数只设置了 `currentSemesterId`
   - 没有设置 `currentSemesterName`

3. **`group/add/add.js` 没有主动获取学期信息**
   - 只是从 `app.globalData` 读取数据
   - 如果全局数据中还没有学期信息，就会导致字段为空

---

## 🛠️ 修复方案

### 修复 1: `app.js` - 添加缺失的全局字段

**文件**: `miniprogram/app.js`  
**位置**: 第6-18行

```javascript
// 修改前
globalData: {
  currentSemester: null,
  currentSemesterId: null,
  // ❌ 缺少 currentSemesterName
  // ❌ 缺少 currentClassName
}

// 修改后
globalData: {
  currentSemester: null,
  currentSemesterId: null,
  currentSemesterName: null,  // ✅ 新增
  currentClassName: null,      // ✅ 新增
}
```

---

### 修复 2: `app.js` - 完善 `getCurrentSemester` 函数

**文件**: `miniprogram/app.js`  
**位置**: 第302-325行

```javascript
// 修改前
getCurrentSemester: function () {
  return new Promise((resolve, reject) => {
    // ... 省略查询代码
    if (res.data.length > 0) {
      const semester = res.data[0];
      this.globalData.currentSemester = semester;
      this.globalData.currentSemesterId = semester._id || semester.semester_id || '';
      // ❌ 没有设置 currentSemesterName
      resolve(semester);
    }
  });
}

// 修改后
getCurrentSemester: function () {
  return new Promise((resolve, reject) => {
    // ... 省略查询代码
    if (res.data.length > 0) {
      const semester = res.data[0];
      this.globalData.currentSemester = semester;
      this.globalData.currentSemesterId = semester._id || semester.semester_id || '';
      this.globalData.currentSemesterName = semester.name || '';  // ✅ 新增
      console.log('已获取当前学期:', semester.name, 'ID:', this.globalData.currentSemesterId);
      resolve(semester);
    }
  });
}
```

---

### 修复 3: `group/add/add.js` - 主动获取学期信息

**文件**: `miniprogram/pages/group/add/add.js`  
**位置**: 第68-110行

```javascript
// 修改前
onLoad: function (options) {
  const semesterId = app.globalData.currentSemesterId || '';
  const semesterName = app.globalData.currentSemesterName || '';  // ❌ 这个值可能不存在
  
  this.setData({
    currentSemesterId: semesterId,    // 可能为空
    currentSemesterName: semesterName  // 可能为空
  });
  
  // ... 其他代码
}

// 修改后
onLoad: async function (options) {
  // 1. 从全局数据读取
  let semesterId = app.globalData.currentSemesterId || '';
  let semesterName = app.globalData.currentSemesterName || '';
  
  // 2. 如果全局数据中没有学期信息，主动获取
  if (!semesterId) {
    console.log('【分组管理】全局数据中没有学期信息，正在获取...');
    try {
      const semester = await app.getCurrentSemester();
      if (semester) {
        semesterId = semester._id || semester.semester_id || '';
        semesterName = semester.name || '';
        console.log('【分组管理】获取学期成功:', semesterName, 'ID:', semesterId);
      }
    } catch (err) {
      console.error('【分组管理】获取学期失败:', err);
    }
  }
  
  this.setData({
    currentSemesterId: semesterId,
    currentSemesterName: semesterName
  });
  
  // ... 其他代码
}
```

---

## 📋 修改文件总结

| 文件 | 修改内容 | 行号 | 状态 |
|------|---------|------|------|
| `app.js` | 添加 `currentSemesterName`、`currentClassName` 字段 | 14-15 | ✅ 完成 |
| `app.js` | 完善 `getCurrentSemester` 函数 | 302-325 | ✅ 完成 |
| `group/add/add.js` | 添加主动获取学期信息逻辑 | 68-123 | ✅ 完成 |

---

## 🧪 测试步骤

### 1. 测试学期信息获取

```javascript
// 在 app.js 的 onLaunch 中添加
console.log('全局学期信息:', {
  semesterId: this.globalData.currentSemesterId,
  semesterName: this.globalData.currentSemesterName
});
```

### 2. 测试分组创建

1. 打开小程序 → 分组管理 → 添加分组
2. 填写分组信息并提交
3. 在云开发控制台查看 `student_groups` 集合
4. 验证 `semester_id` 和 `semester_name` 字段是否有值

### 3. 测试数据完整性

**预期结果**:
```json
{
  "_id": "xxx",
  "group_name": "学习小组1",
  "group_type": "学习小组",
  "class_id": "dde8ef4869bcdadf00df0a27064efcbe",
  "semester_id": "semester_xxx",  // ✅ 应该有值
  "semester_name": "2025-2026学年第一学期",  // ✅ 应该有值
  "members": [...],
  "created_at": "2026-04-14T14:00:00.000Z"
}
```

---

## 💡 其他页面检查建议

以下页面也使用了 `app.globalData.currentSemesterId` 和 `currentSemesterName`，建议检查：

| 页面 | 是否需要修复 | 说明 |
|------|-------------|------|
| `score/add/add.js` | ⚠️ 需要检查 | 使用了 `currentSemesterId` |
| `score/rules/rules.js` | ⚠️ 需要检查 | 使用了 `currentSemesterId` |
| `volunteer/add/add.js` | ⚠️ 需要检查 | 使用了 `currentSemesterId` |
| `attendance/attendance.js` | ⚠️ 需要检查 | 使用了 `currentSemesterId` |

**建议**: 在这些页面的 `onLoad` 中也添加主动获取学期信息的逻辑，确保数据完整性。

---

## 🎯 预防措施

### 1. 数据写入时强制校验

在 `group/add/add.js` 的 `onSubmit` 函数中添加：

```javascript
// 提交前校验必填字段
if (!this.data.currentSemesterId) {
  wx.showToast({
    title: '无法获取学期信息，请刷新重试',
    icon: 'none'
  });
  return;
}
```

### 2. 添加数据完整性检查函数

```javascript
// 在 group/add/add.js 中添加
validateFormData: function() {
  const { currentSemesterId, currentSemesterName, currentClassId } = this.data;
  
  if (!currentSemesterId) {
    console.error('缺少学期ID');
    return false;
  }
  
  if (!currentClassId) {
    console.error('缺少班级ID');
    return false;
  }
  
  return true;
}
```

---

## ✅ 修复完成

现在创建分组时，`student_groups` 集合中的数据应该包含完整的 `semester_id` 和 `semester_name` 字段值。

**修复结果**:
- ✅ 全局数据定义完整
- ✅ 学期获取函数完善
- ✅ 分组页面主动获取学期信息
- ✅ 数据完整性校验加强

---

## 📞 技术支持

如遇其他问题，请检查：
1. 云开发控制台中 `semesters` 集合是否有 `status: 'active'` 的记录
2. `classes` 集合中的 `current_semester_id` 字段是否正确
3. 小程序控制台中的日志输出，确认学期信息是否正确获取
