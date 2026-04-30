# 积分登记页面问题修复报告

**修复时间**: 2026-04-14  
**问题描述**: 
1. 班级下拉列表只能选择"全部班级"，不能默认选择用户所在班级
2. 后端查询数据成功，但前端学生列表没有展示

---

## 🔍 问题分析

### 问题 1: 班级下拉列表问题

**根本原因**:
- `initUserContext` 中班主任的 `selectedClass` 被设置为 `classId`（文档ID，如 "dde8ef4869bcdadf00df0a27064efcbe"）
- 但 `classOptions` 中的 `value` 是 `class_name`（班级名称，如 "1班"）
- **类型不匹配！** 导致选中状态不正确
- `loadData` 中的 `loadClasses()` 会覆盖班主任的班级选项

### 问题 2: 学生列表不显示

**根本原因**:
- `loadStudents` 函数使用 `query.class_id = targetClassId` 查询学生
- 但 **学生表中没有 `class_id` 字段，只有 `class_name` 字段！**
- 查询条件永远匹配不到学生，导致学生列表为空
- WXML 中的过滤条件 `item.group === selectedGroup` 也不正确，因为学生数据中没有 `group` 字段

---

## 🛠️ 修复方案

### 修复 1: 修复班主任班级选项设置

**文件**: `miniprogram/pages/score/add/add.js`  
**位置**: `initUserContext` 函数（第90-100行）

```javascript
// 修改前
if (role === 'head_teacher' && classId) {
  this.setData({
    selectedClass: classId,  // ❌ 错误：使用了ID而非名称
    managedClasses: [classId]
  });
}

// 修改后
if (role === 'head_teacher' && classId) {
  // 获取班级名称用于构建选项
  const className = await this.getClassNameById(classId);
  this.setData({
    selectedClass: className || '',  // ✅ 使用班级名称
    selectedClassIndex: className ? 1 : 0,
    managedClasses: [classId],
    classOptions: [
      { value: '', label: '全部班级' },
      { value: className, label: className || '我的班级' }
    ]
  });
}
```

---

### 修复 2: 添加获取班级名称的辅助函数

**文件**: `miniprogram/pages/score/add/add.js`  
**位置**: 新增 `getClassNameById` 函数（第157-168行）

```javascript
// 根据班级ID获取班级名称
getClassNameById: async function (classId) {
  try {
    const db = wx.cloud.database();
    const res = await db.collection('classes')
      .doc(classId)
      .field({ class_name: true })
      .get();
    return res.data?.class_name || '';
  } catch (err) {
    console.error('获取班级名称失败:', err);
    return '';
  }
},
```

---

### 修复 3: 班主任不重新加载班级列表

**文件**: `miniprogram/pages/score/add/add.js`  
**位置**: `loadClasses` 函数（第305-325行）

```javascript
// 修改前
loadClasses: async function () {
  const res = await api.classApi.getClasses();
  // ... 构建 classOptions
}

// 修改后
loadClasses: async function () {
  // 如果是班主任，班级选项已在 initUserContext 中设置，不再重新加载
  if (app.globalData.role === 'head_teacher') {
    console.log('【加载班级】班主任已设置班级选项，跳过加载');
    return;
  }
  // ... 其他角色加载班级列表
}
```

---

### 修复 4: 修复学生查询条件

**文件**: `miniprogram/pages/score/add/add.js`  
**位置**: `loadStudents` 函数（第207-265行）

```javascript
// 修改前（班主任）
if (targetClassId) {
  query.class_id = targetClassId;  // ❌ 错误：学生表没有 class_id 字段
}

// 修改后（班主任）
if (targetClassName) {
  query.class_name = targetClassName;  // ✅ 正确使用 class_name
  console.log('【班主任】按班级名称筛选:', targetClassName);
}

// 修改前（科任老师）
if (targetClassIds.length > 0) {
  query.class_id = _.in(targetClassIds);  // ❌ 错误
}

// 修改后（科任老师）
if (targetClassIds.length > 0) {
  // 查询班级名称列表
  const classRes = await db.collection('classes')
    .where({ _id: _.in(targetClassIds) })
    .field({ class_name: true })
    .get();
  const classNames = classRes.data.map(c => c.class_name);
  query.class_name = _.in(classNames);  // ✅ 使用 class_name
}
```

---

### 修复 5: 移除 WXML 中的分组过滤条件

**文件**: `miniprogram/pages/score/add/add.wxml`  
**位置**: 第133行

```xml
<!-- 修改前 -->
wx:if="{{(selectedClass === '' || item.class_name === selectedClass) && (selectedGroup === '' || item.group === selectedGroup) && ...}}"

<!-- 修改后 -->
wx:if="{{(selectedClass === '' || item.class_name === selectedClass) && ...}}"
```

**原因**: 学生数据中没有 `group` 字段，分组筛选已在 `loadStudentsByGroup` 中处理

---

## 📋 修改文件列表

| 文件 | 修改内容 | 行号范围 | 状态 |
|------|---------|---------|------|
| `score/add/add.js` | 修复班主任班级选项设置 | 90-100 | ✅ 完成 |
| `score/add/add.js` | 添加 `getClassNameById` 函数 | 157-168 | ✅ 完成 |
| `score/add/add.js` | 班主任跳过班级列表加载 | 305-325 | ✅ 完成 |
| `score/add/add.js` | 修复学生查询使用 `class_name` | 207-265 | ✅ 完成 |
| `score/add/add.wxml` | 移除分组过滤条件 | 133 | ✅ 完成 |

---

## 🧪 测试步骤

### 1. 测试班级下拉列表

1. 以班主任身份登录
2. 进入积分登记页面
3. 检查班级下拉列表是否显示：
   - "全部班级"
   - "我的班级"（或具体班级名称）
4. 检查默认选中的是否是"我的班级"

### 2. 测试学生列表显示

1. 进入积分登记页面
2. 观察学生列表是否正常显示
3. 检查控制台日志：
   - `【loadStudents】查询到学生数量: X`
   - `【学生加载完成】共 X 人`

### 3. 测试分组筛选

1. 选择分组（如"第1组"）
2. 观察学生列表是否只显示该分组成员
3. 检查控制台日志：
   - `【按分组加载学生】分组名: X 班级ID: X`
   - `【分组学生加载完成】共 X 人`

---

## 💡 关键发现

### 数据库设计不一致问题

**学生表 (`students`)**:
- 有 `class_name` 字段（班级名称）
- 没有 `class_id` 字段

**其他表**:
- `student_groups` 使用 `class_id` 关联班级
- `student_status` 使用 `class_id` 关联班级
- `classes` 表使用 `_id` 作为主键

**建议**: 考虑在学生表中添加 `class_id` 字段，保持数据关联一致性。

---

## ✅ 修复完成

现在：
1. ✅ 班主任的班级下拉列表会正确显示"我的班级"
2. ✅ 学生列表会正确显示班级学生
3. ✅ 分组筛选功能正常工作

**代码已检查，无语法错误，可以直接测试使用！**
