# 新登录流程与数据隔离方案

## 1. 概述

为了实现从最开始就进行数据隔离，我们优化了登录流程，用户在登录成功后不会直接进入首页，而是先进入欢迎页选择或创建班级，这样才能确保数据隔离的正确性。

---

## 2. 新登录流程

### 2.1 流程图

```
登录成功
  ↓
welcome 页面
  ↓ 查询 user_class_relation 表
  ↓ 显示已加入班级列表
  ↓
  ├─ 创建班级 → create-class 页面
  │   ↓ 填写班级信息和班主任信息
  │   ↓ 创建 classes 记录 + user_class_relation 记录（is_owner: true）
  │   ↓ 显示班级代码
  │   ↓ 返回欢迎页
  │
  ├─ 加入班级 → join-class 页面
  │   ↓ 查找班级（班级代码/老师手机号）
  │   ↓ 选择身份（老师/家长/学生）
  │   ↓ 填写信息（家长：选择/添加学生；老师：姓名+科目）
  │   ↓ 创建 user_class_relation 记录
  │   ↓ 显示成功页面
  │   ↓ 返回欢迎页 或 进入班级
  │
  └─ 进入班级 → 首页
      ↓ 设置全局变量 class_id
      ↓ 显示班级功能菜单
```

### 2.2 核心数据结构

#### classes 表（班级信息）

```javascript
{
  _id: String,
  class_id: String,        // 班级业务ID
  class_name: String,      // 班级名称
  class_code: String,      // 班级码（6位）
  grade: String,           // 年级
  grade_type: String,      // 学段类型
  school: String,          // 学校名称
  creator_id: String,      // 创建人openid
  creator_name: String,    // 创建人姓名
  creator_phone: String,   // 创建人手机号
  subject: String,         // 创建人科目
  student_count: Number,   // 预计学生人数
  status: String,          // 班级状态
  current_semester_id: String, // 当前学期ID
  settings: Object,        // 班级设置
  created_at: Date,
  updated_at: Date
}
```

#### user_class_relation 表（用户与班级关系）

```javascript
{
  _id: String,
  relation_id: String,     // 关系业务ID
  user_openid: String,     // 用户openid
  class_id: String,        // 班级ID
  role: String,            // 角色：head_teacher/subject_teacher/student/parent
  is_owner: Boolean,       // 是否为班级创建者
  student_id: String,      // 关联的学生学号（学生或家长身份）
  status: String,          // 状态：joined/pending/rejected/left
  join_time: Date,         // 加入时间
  leave_time: Date,        // 离开时间
  apply_info: Object,      // 申请信息
  approval_info: Object,   // 审批信息
  created_at: Date,
  updated_at: Date
}
```

---

## 3. 数据隔离实现

### 3.1 全局变量管理

在 `app.js` 中维护以下全局变量：

```javascript
globalData: {
  userInfo: null,        // 用户基本信息
  openid: null,          // 用户openid
  role: null,            // 当前角色
  student_id: null,      // 学生学号（学生或家长身份）
  class_id: null,        // 当前班级ID（用于数据隔离）
  currentSemester: null, // 当前学期
  envId: null           // 云开发环境ID
}
```

### 3.2 数据隔离规则

#### 查询数据时的隔离

```javascript
// 在 app.js 中构建数据隔离查询条件
buildDataQuery: function (collectionName, extraQuery = {}) {
  const db = wx.cloud.database();
  const _ = db.command;
  const role = this.globalData.role;
  const classId = this.globalData.class_id;
  const studentId = this.globalData.student_id;

  let query = { ...extraQuery };

  // 根据角色添加数据隔离条件
  if (role === 'admin') {
    // 管理员可查看所有数据，不添加隔离条件
  } else if (role === 'head_teacher' || role === 'subject_teacher' || role === 'class_cadre') {
    // 教师/班委：查看本班数据 + 全局数据（class_id 为空的）
    if (classId) {
      query.class_id = _.in([classId, '', null]);
    }
  } else if (role === 'student' || role === 'parent') {
    // 学生/家长：仅查看自己（或关联学生）的数据
    if (studentId) {
      query.student_id = studentId;
    }
  }

  return query;
}
```

#### 写入数据时的隔离

```javascript
// 写入数据时，必须设置 class_id 字段
const student = await api.studentApi.getStudentByStudentId(studentId);
const recordData = {
  student_id: studentId,
  class_id: student.class_id || student.class_name, // 从学生信息获取班级归属
  // ... 其他字段
};
```

---

## 4. 页面权限控制

### 4.1 页面访问控制

#### 登录页面（login）

- 所有用户可访问
- 登录成功后跳转到欢迎页

#### 欢迎页面（welcome）

- 仅登录用户可访问
- 显示用户已加入的班级列表
- 提供创建班级和加入班级的入口

#### 创建班级页面（class/add）

- 仅登录用户可访问（不再限制为管理员）
- 创建班级后自动创建 user_class_relation 记录（is_owner: true）

#### 加入班级页面（join）

- 仅登录用户可访问
- 通过班级码或老师手机号查找班级
- 选择身份并填写信息
- 创建 user_class_relation 记录

#### 班级详情页面（class/detail）

- 仅班级成员可访问
- 显示班级基本信息和功能菜单

#### 功能页面（学生管理、积分管理等）

- 仅班级成员可访问
- 根据角色显示不同的功能菜单
- 数据查询时自动应用数据隔离

### 4.2 管理员专用页面

原有的功能页面（如学生列表、积分管理等）可以保留给系统管理员使用，用于：
- 查看所有班级的数据
- 管理用户权限
- 系统配置
- 数据统计

---

## 5. 角色定义

### 5.1 角色类型

| 角色代码 | 角色名称 | 说明 | 数据范围 |
|---------|---------|------|---------|
| `admin` | 系统管理员 | 系统管理者，拥有所有权限 | 全局数据 |
| `head_teacher` | 班主任 | 班级创建者或班级管理员 | 本班数据 |
| `subject_teacher` | 科任教师 | 科任老师 | 授课班级数据 |
| `class_cadre` | 班干部 | 学生干部 | 本班数据 |
| `student` | 学生 | 学生本人 | 本人数据 |
| `parent` | 家长 | 学生家长 | 关联学生数据 |

### 5.2 角色判断逻辑

在 `user_class_relation` 表中，`role` 字段表示用户在特定班级中的角色：

- **班主任**：创建班级的用户（`is_owner: true`）
- **科任教师**：通过加入班级成为老师（`role: 'subject_teacher'`）
- **学生**：通过加入班级成为学生（`role: 'student'`）
- **家长**：通过加入班级成为家长（`role: 'parent'`）

**注意**：用户在不同班级中可以有不同的角色。

---

## 6. 开发注意事项

### 6.1 必须检查 class_id

所有涉及班级数据的查询和写入操作，都必须检查 `class_id` 是否存在：

```javascript
// 错误示例
const res = await db.collection('score_records').where({ student_id }).get();

// 正确示例
const classId = app.globalData.class_id;
if (!classId) {
  wx.showToast({ title: '请先选择班级', icon: 'none' });
  return;
}
const query = app.buildDataQuery('score_records', { student_id });
const res = await db.collection('score_records').where(query).get();
```

### 6.2 班级切换

如果用户需要切换班级，应该：
1. 清空当前的全局变量（`class_id`, `student_id`）
2. 跳转到欢迎页重新选择班级
3. 重新加载班级数据

```javascript
// 切换班级
onChangeClass: function () {
  app.globalData.class_id = null;
  app.globalData.student_id = null;
  wx.removeStorageSync('class_id');
  wx.removeStorageSync('student_id');
  
  wx.redirectTo({
    url: '/pages/welcome/welcome'
  });
}
```

### 6.3 权限检查顺序

在页面加载时，应该按以下顺序检查权限：

1. 检查是否登录（`app.globalData.openid`）
2. 检查是否选择班级（`app.globalData.class_id`）
3. 检查角色权限（`app.hasPermission()`）
4. 检查数据归属（`app.canOperateData()`）

---

## 7. 测试清单

### 7.1 登录流程测试

- [ ] 首次登录，显示欢迎页，无班级列表
- [ ] 创建班级成功，班级列表显示新班级
- [ ] 加入班级成功，班级列表显示新班级
- [ ] 选择班级进入，显示正确的班级数据
- [ ] 切换班级，数据正确切换

### 7.2 数据隔离测试

- [ ] 班主任只能看到本班学生
- [ ] 学生只能看到自己的数据
- [ ] 家长只能看到关联学生的数据
- [ ] 管理员可以看到所有数据
- [ ] 不同班级的数据完全隔离

### 7.3 权限测试

- [ ] 未登录用户无法访问班级页面
- [ ] 未选择班级的用户无法访问功能页面
- [ ] 不同角色看到不同的功能菜单
- [ ] 权限不足的操作被正确拦截

---

## 8. 数据库索引建议

### 8.1 classes 表

```javascript
// 唯一索引
db.collection('classes').createIndex({
  keys: { class_id: 1 },
  options: { unique: true }
});

db.collection('classes').createIndex({
  keys: { class_code: 1 },
  options: { unique: true }
});

// 普通索引
db.collection('classes').createIndex({
  keys: { creator_id: 1 }
});

db.collection('classes').createIndex({
  keys: { status: 1 }
});
```

### 8.2 user_class_relation 表

```javascript
// 复合唯一索引
db.collection('user_class_relation').createIndex({
  keys: { user_openid: 1, class_id: 1 },
  options: { unique: true }
});

// 普通索引
db.collection('user_class_relation').createIndex({
  keys: { user_openid: 1 }
});

db.collection('user_class_relation').createIndex({
  keys: { class_id: 1 }
});

db.collection('user_class_relation').createIndex({
  keys: { status: 1 }
});
```

---

**版本**: 1.0  
**创建日期**: 2026-03-18  
**最后更新**: 2026-03-18  
**相关文档**: DATABASE_SCHEMA_V2.md, PERMISSION_GUIDE.md
