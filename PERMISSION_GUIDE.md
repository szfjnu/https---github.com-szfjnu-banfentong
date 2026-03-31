# 班级积分管理系统 - 权限管理开发指引

## 1. 概述

本文档定义了系统的权限管理架构，指导后续开发时正确实现页面权限和数据权限隔离。

---

## 2. 角色定义

| 角色代码 | 角色名称 | 数据范围 | 说明 |
|---------|---------|---------|------|
| `admin` | 系统管理员 | 全局 | 拥有所有权限，可管理所有班级数据 |
| `head_teacher` | 班主任 | 本班 | 仅能管理自己负责的班级数据，通过 `class_id` 隔离 |
| `subject_teacher` | 科任教师 | 授课班级 | 可查看/管理分配班级的相关数据 |
| `class_cadre` | 班委 | 本班 | 协助班主任管理部分班级事务 |
| `student` | 学生 | 本人 | 仅查看和操作自己的数据 |
| `parent` | 家长 | 关联学生 | 仅查看关联学生的数据 |

---

## 3. 数据隔离核心字段

### 3.1 关联键规范

| 字段名 | 类型 | 说明 |
|-------|------|------|
| `student_id` | String | 学生业务主键，关联学生身份 |
| `class_id` | String | 班级业务主键，用于数据隔离 |
| `_openid` | String | 用户微信OpenID，关联用户身份 |

### 3.2 必须包含 class_id 的集合

以下集合**必须**包含 `class_id` 字段以支持权限隔离：

| 集合名称 | 用途 | 隔离规则 |
|---------|------|---------|
| `students` | 学生信息 | 按班级归属隔离 |
| `score_records` | 积分记录 | 按学生所属班级隔离 |
| `score_items` | 积分项目 | 支持班级专属规则或全局规则 |
| `redemption_items` | 兑换物品 | 支持班级专属物品或全局物品 |
| `redemption_requests` | 兑换请求 | 按学生所属班级隔离 |
| `volunteer_records` | 志愿服务 | 按学生所属班级隔离 |
| `attendance_records` | 考勤记录 | 按学生所属班级隔离 |
| `discipline_records` | 处分记录 | 按学生所属班级隔离 |
| `grade_records` | 成绩记录 | 按学生所属班级隔离 |
| `seating_charts` | 座位表 | 按班级隔离 |
| `student_groups` | 学生分组 | 按班级隔离 |
| `duty_schedule` | 值日表 | 按班级隔离 |

### 3.3 class_id 取值规范

| 取值 | 含义 | 说明 |
|-----|------|------|
| 具体班级ID | 班级专属 | 仅该班级可见 |
| 空字符串 `''` 或 `null` | 全局 | 所有班级可见（如全局积分规则） |

---

## 4. 权限检查规范

### 4.1 统一权限检查方法

**推荐使用** `app.hasPermission(module, action)` 方法：

```javascript
// 检查是否有权限
const canWrite = app.hasPermission('student', 'write');
const canApprove = app.hasPermission('score', 'approve');
const isAdmin = app.globalData.role === 'admin';
```

### 4.2 权限模块定义

| 模块名 | 说明 | 可用操作 |
|-------|------|---------|
| `student` | 学生管理 | read, write, delete |
| `score` | 积分管理 | read, write, approve |
| `attendance` | 考勤管理 | read, write |
| `dorm` | 宿舍管理 | read, write |
| `discipline` | 处分管理 | read, write |
| `volunteer` | 志愿服务 | read, write |
| `redemption` | 积分兑换 | read, write |
| `grade` | 成绩管理 | read, write |
| `duty` | 值日管理 | read, write |
| `profile` | 个人信息 | read |

### 4.3 数据隔离查询模板

```javascript
// 在 Page 中获取用户班级
const userClassId = app.globalData.userInfo?.class_id || '';
const role = app.globalData.role;
const db = wx.cloud.database();
const _ = db.command;

// 构建数据隔离查询条件
function buildClassQuery(role, classId) {
  if (role === 'admin') {
    // 管理员可查看所有数据
    return {};
  } else if (role === 'head_teacher' || role === 'subject_teacher' || role === 'class_cadre') {
    // 教师/班委仅查看本班数据 + 全局数据
    return {
      class_id: _.in([classId, '', null])
    };
  } else if (role === 'student' || role === 'parent') {
    // 学生/家长仅查看自己的数据
    return {
      student_id: app.globalData.student_id
    };
  }
  return {};
}

// 使用示例
const query = buildClassQuery(role, userClassId);
const res = await db.collection('score_records').where(query).get();
```

---

## 5. 页面权限控制

### 5.1 页面入口控制

在页面 `onLoad` 中统一检查权限：

```javascript
Page({
  onLoad: function() {
    if (!this.checkPermission()) {
      wx.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.loadData();
  },

  checkPermission: function() {
    const role = app.globalData.role;
    // 定义允许访问的角色
    const allowedRoles = ['admin', 'head_teacher', 'subject_teacher'];
    return allowedRoles.includes(role);
  }
});
```

### 5.2 按角色显示UI元素

```javascript
Page({
  data: {
    showAdminPanel: false,
    canEdit: false
  },

  onLoad: function() {
    const role = app.globalData.role;
    this.setData({
      showAdminPanel: role === 'admin',
      canEdit: app.hasPermission('student', 'write')
    });
  }
});
```

```xml
<!-- wxml -->
<view wx:if="{{showAdminPanel}}" class="admin-panel">
  <!-- 管理员专属功能 -->
</view>

<button wx:if="{{canEdit}}" bindtap="onEdit">编辑</button>
```

---

## 6. 已完成功能的权限修复清单

### 6.1 需要添加 class_id 的集合

| 集合 | 当前状态 | 修复优先级 |
|-----|---------|-----------|
| `score_records` | 需补充 | 高 |
| `redemption_items` | 需补充 | 高 |
| `redemption_requests` | 需补充 | 高 |
| `volunteer_records` | 需补充 | 中 |

### 6.2 已支持 class_id 的集合

| 集合 | 状态 |
|-----|------|
| `students` | ✅ 已支持 |
| `score_items` | ✅ 已支持 |

---

## 7. 新增数据时的 class_id 处理

### 7.1 从学生信息获取

```javascript
// 添加积分记录时，从学生信息获取 class_id
const student = await api.studentApi.getStudentByStudentId(studentId);
const recordData = {
  student_id: studentId,
  class_id: student.class_id || student.class_name, // 班级归属
  // ... 其他字段
};
```

### 7.2 从用户信息获取

```javascript
// 班主任添加规则时，使用自己的班级
const ruleData = {
  class_id: app.globalData.userInfo?.class_id || '', // 空为全局规则
  // ... 其他字段
};
```

---

## 8. 权限配置表（app.js 更新）

```javascript
const permissions = {
  admin: {
    all: ['read', 'write', 'delete', 'approve'],
    // 管理员拥有所有权限，数据隔离为全局
  },
  head_teacher: {
    student: ['read', 'write', 'delete'],
    score: ['read', 'write', 'approve'],
    attendance: ['read', 'write'],
    dorm: ['read', 'write'],
    discipline: ['read', 'write'],
    volunteer: ['read', 'write'],
    redemption: ['read', 'write', 'approve'],
    grade: ['read', 'write'],
    duty: ['read', 'write'],
    // 数据隔离范围：class_id 匹配本班
  },
  subject_teacher: {
    student: ['read'],
    score: ['read', 'write'],
    grade: ['read', 'write'],
    // 数据隔离范围：assigned_classes 中的班级
  },
  class_cadre: {
    score: ['read', 'write'],
    duty: ['read', 'write'],
    attendance: ['read', 'write'],
    // 数据隔离范围：本班
  },
  student: {
    profile: ['read'],
    score: ['read'],
    volunteer: ['read', 'write'],
    redemption: ['read', 'write'],
    // 数据隔离范围：仅本人数据
  },
  parent: {
    profile: ['read'],
    score: ['read'],
    attendance: ['read'],
    // 数据隔离范围：关联学生数据
  }
};
```

---

## 9. 开发注意事项

### 9.1 数据查询必须带权限过滤

❌ **错误示例**：
```javascript
// 没有权限过滤，所有人都能看到所有数据
const res = await db.collection('score_records').get();
```

✅ **正确示例**：
```javascript
// 带权限过滤
const query = buildClassQuery(role, userClassId);
const res = await db.collection('score_records').where(query).get();
```

### 9.2 数据写入必须设置 class_id

❌ **错误示例**：
```javascript
// 没有设置 class_id，导致数据隔离失效
await db.collection('score_records').add({ data: { student_id, score_change } });
```

✅ **正确示例**：
```javascript
// 设置 class_id
await db.collection('score_records').add({ 
  data: { 
    student_id, 
    class_id: student.class_id,
    score_change 
  } 
});
```

### 9.3 班主任数据隔离

班主任只能操作本班数据，关键点：
1. 查询时：`class_id: _.in([userClassId, '', null])`
2. 写入时：`class_id: userClassId`
3. 编辑时：检查数据是否属于本班

### 9.4 学生/家长数据隔离

学生和家长只能查看/操作自己（或关联学生）的数据：
1. 查询时：`student_id: app.globalData.student_id`
2. 写入时：`student_id: app.globalData.student_id`

---

## 10. 测试检查清单

### 10.1 权限测试

- [ ] 管理员可以访问所有页面和数据
- [ ] 班主任只能看到本班学生和本班数据
- [ ] 学生只能看到自己的数据
- [ ] 家长只能看到关联学生的数据
- [ ] 无权限用户被正确拒绝访问

### 10.2 数据隔离测试

- [ ] 不同班级的班主任看到不同的学生列表
- [ ] 不同班级的积分记录相互隔离
- [ ] 全局规则对所有班级可见
- [ ] 班级专属规则仅对本班可见

---

**版本**: 1.0  
**创建日期**: 2025-03-17  
**最后更新**: 2025-03-17
