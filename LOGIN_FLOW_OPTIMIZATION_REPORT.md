# 登录流程优化完成报告

## 1. 优化概述

为了实现从最开始就进行数据隔离，我们优化了登录流程，用户在登录成功后不会直接进入首页，而是先进入欢迎页选择或创建班级。这样可以确保每个用户都明确选择要操作的班级，从而实现精准的数据隔离。

---

## 2. 完成的工作

### 2.1 数据库设计更新

**文件**: `DATABASE_SCHEMA_V2.md`

#### 新增集合

1. **`classes` (班级信息表)**
   - 存储班级的基本信息
   - 包含班级码、年级、学校、创建者等信息
   - 支持班级设置和状态管理

2. **`user_class_relation` (用户与班级关系表)**
   - 存储用户与班级的关联关系
   - 支持多角色（班主任、科任老师、学生、家长）
   - 记录申请信息和审批信息
   - 实现多班级数据隔离

#### 更新内容

- 更新了索引建议部分
- 更新了版本号为 2.1
- 添加了更新记录

---

### 2.2 页面功能优化

#### 2.2.1 欢迎页 (welcome)

**修改文件**:
- `miniprogram/pages/welcome/welcome.js`
- `miniprogram/pages/welcome/welcome.wxml`

**主要改动**:

1. 将数据源从 `class_members` 改为 `user_class_relation`
2. 更新字段名以匹配新的数据库结构
3. 在进入班级时，将 `class_id` 和 `student_id` 保存到全局变量
4. 显示班级管理员标识

**关键代码**:

```javascript
// 加载我的班级
loadMyClasses: async function () {
  const joinedRes = await db.collection('user_class_relation')
    .where({
      user_openid: app.globalData.openid,
      status: 'joined'
    })
    .get();
  // ...
}

// 进入班级
onEnterClass: function (e) {
  const classItem = e.currentTarget.dataset.item;
  app.globalData.class_id = classItem._id;
  wx.setStorageSync('class_id', classItem._id);
  // ...
}
```

---

#### 2.2.2 创建班级页 (class/add)

**修改文件**: `miniprogram/pages/class/add/add.js`

**主要改动**:

1. 放宽权限限制：所有登录用户都可以创建班级（不再限制为管理员）
2. 创建班级时，同时创建 `user_class_relation` 记录
3. 设置 `is_owner: true` 标识创建者
4. 将班级ID保存到全局变量

**关键代码**:

```javascript
// 创建班级成功后
const result = await db.collection('classes').add({ data: saveData });

// 创建 user_class_relation 记录
const relationData = {
  user_openid: app.globalData.openid,
  class_id: result._id,
  role: 'head_teacher',
  is_owner: true,
  status: 'joined',
  join_time: db.serverDate(),
  // ...
};

await db.collection('user_class_relation').add({ data: relationData });

// 保存到全局变量
app.globalData.class_id = result._id;
wx.setStorageSync('class_id', result._id);
```

---

#### 2.2.3 加入班级确认页 (join/confirm)

**修改文件**: `miniprogram/pages/join/confirm/confirm.js`

**主要改动**:

1. 将数据源从 `class_members` 改为 `user_class_relation`
2. 更新字段名以匹配新的数据库结构
3. 加入班级成功后，保存 `class_id` 和 `student_id` 到全局变量
4. 支持不同身份的申请信息记录

**关键代码**:

```javascript
// 创建 user_class_relation 记录
const relationData = {
  user_openid: app.globalData.openid,
  class_id: this.data.classId,
  role: this.data.role,
  is_owner: false,
  status: 'joined',
  join_time: db.serverDate(),
  // ...
};

await db.collection('user_class_relation').add({ data: relationData });

// 保存到全局变量
app.globalData.class_id = this.data.classId;
wx.setStorageSync('class_id', this.data.classId);
```

---

### 2.3 API 封装扩展

**修改文件**: `miniprogram/utils/api.js`

**新增 API**:

```javascript
const relationApi = {
  // 获取用户的所有班级关系
  getUserRelations: (userOpenid, status = '') => { /* ... */ },

  // 获取班级的所有成员关系
  getClassRelations: (classId, status = 'joined') => { /* ... */ },

  // 添加用户班级关系
  addRelation: (data) => { /* ... */ },

  // 更新用户班级关系
  updateRelation: (relationId, data) => { /* ... */ },

  // 删除用户班级关系（退出班级）
  deleteRelation: (relationId) => { /* ... */ },

  // 检查用户是否已加入班级
  checkUserInClass: (userOpenid, classId) => { /* ... */ },

  // 根据关系ID获取关系详情
  getRelation: (relationId) => { /* ... */ }
};
```

---

### 2.4 文档更新

#### 新增文档

**文件**: `NEW_LOGIN_FLOW.md`

**内容**:
- 新登录流程详细说明
- 数据隔离实现方案
- 页面权限控制规则
- 角色定义和判断逻辑
- 开发注意事项
- 测试清单
- 数据库索引建议

---

## 3. 数据隔离机制

### 3.1 核心逻辑

用户登录后，必须选择一个班级才能访问功能页面。选择班级后，系统会将 `class_id` 保存到全局变量：

```javascript
// app.js
globalData: {
  userInfo: null,
  openid: null,
  role: null,
  student_id: null,      // 学生或家长关联的学号
  class_id: null,        // 当前班级ID（用于数据隔离）
  currentSemester: null,
  envId: null
}
```

### 3.2 数据查询隔离

在查询数据时，通过 `app.buildDataQuery()` 自动添加数据隔离条件：

```javascript
// 根据角色自动添加隔离条件
if (role === 'head_teacher' || role === 'subject_teacher' || role === 'class_cadre') {
  query.class_id = _.in([classId, '', null]); // 本班数据 + 全局数据
} else if (role === 'student' || role === 'parent') {
  query.student_id = studentId; // 仅本人数据
}
```

### 3.3 数据写入隔离

在写入数据时，必须设置 `class_id` 字段：

```javascript
const recordData = {
  student_id: studentId,
  class_id: app.globalData.class_id, // 从全局变量获取
  // ... 其他字段
};
```

---

## 4. 新旧流程对比

### 4.1 旧流程

```
登录 → 选择角色 → 输入学号（学生/家长） → 进入首页
问题：学生/家长需要提前在系统中存在，无法实现真正的数据隔离
```

### 4.2 新流程

```
登录 → 欢迎页 → 创建/加入班级 → 选择班级 → 进入首页
优势：从最开始就明确班级归属，实现精准的数据隔离
```

---

## 5. 测试清单

### 5.1 登录流程测试

- [ ] 首次登录，显示欢迎页，无班级列表
- [ ] 创建班级成功，班级列表显示新班级
- [ ] 创建班级成功，显示班级码
- [ ] 加入班级成功，班级列表显示新班级
- [ ] 选择班级进入，显示正确的班级数据
- [ ] 切换班级，数据正确切换

### 5.2 数据隔离测试

- [ ] 班主任只能看到本班学生
- [ ] 科任老师只能看到授课班级的学生
- [ ] 学生只能看到自己的数据
- [ ] 家长只能看到关联学生的数据
- [ ] 管理员可以看到所有数据
- [ ] 不同班级的数据完全隔离

### 5.3 权限测试

- [ ] 未登录用户无法访问班级页面
- [ ] 未选择班级的用户无法访问功能页面
- [ ] 班主任可以管理本班所有数据
- [ ] 科任老师可以查看本班数据，可以添加积分
- [ ] 学生只能查看和操作自己的数据
- [ ] 家长只能查看关联学生的数据

### 5.4 边界情况测试

- [ ] 一个用户可以加入多个班级
- [ ] 一个用户在不同班级可以有不同角色
- [ ] 创建班级的用户自动成为班主任
- [ ] 加入班级后可以正常退出
- [ ] 班级码唯一且正确生成

---

## 6. 部署清单

### 6.1 数据库准备

在云开发控制台中创建以下集合：

```bash
# 1. 创建 classes 集合
# 2. 创建 user_class_relation 集合
```

### 6.2 索引创建

```javascript
// 在云开发控制台执行以下索引创建命令

// classes 集合索引
db.collection('classes').createIndex({
  keys: { class_id: 1 },
  options: { unique: true }
});

db.collection('classes').createIndex({
  keys: { class_code: 1 },
  options: { unique: true }
});

db.collection('classes').createIndex({
  keys: { creator_id: 1 }
});

// user_class_relation 集合索引
db.collection('user_class_relation').createIndex({
  keys: { user_openid: 1, class_id: 1 },
  options: { unique: true }
});

db.collection('user_class_relation').createIndex({
  keys: { user_openid: 1 }
});

db.collection('user_class_relation').createIndex({
  keys: { class_id: 1 }
});
```

### 6.3 权限配置

在云开发控制台设置数据库权限：

**开发环境**:
- `classes`: 所有用户可读写
- `user_class_relation`: 所有用户可读写

**生产环境**:
- `classes`: 所有用户可读,仅创建者可写
- `user_class_relation`: 所有用户可读,仅创建者可写

---

## 7. 注意事项

### 7.1 数据迁移

如果已有数据，需要进行数据迁移：

1. 创建 `classes` 集合
2. 将现有的班级信息迁移到 `classes` 集合
3. 创建 `user_class_relation` 集合
4. 根据现有用户信息创建关系记录

### 7.2 兼容性

- 现有的管理员登录流程保持不变
- 现有的功能页面可以保留给管理员使用
- 新的用户需要按照新流程操作

### 7.3 安全性

- 班级码应该定期更新（可选功能）
- 敏感操作需要权限验证
- 数据写入必须设置 `class_id`

---

## 8. 后续优化建议

### 8.1 功能优化

1. **班级码管理**
   - 支持重新生成班级码
   - 设置班级码有效期
   - 班级码使用次数限制

2. **审批流程**
   - 加入班级需要班主任审批
   - 审批通过后状态从 `pending` 变为 `joined`
   - 审批拒绝后可以重新申请

3. **班级管理**
   - 班主任可以移除班级成员
   - 班主任可以转让管理员权限
   - 班级归档功能

### 8.2 性能优化

1. **缓存机制**
   - 缓存用户的班级列表
   - 缓存班级的基本信息
   - 定期刷新缓存

2. **查询优化**
   - 使用复合索引提高查询效率
   - 分页加载班级成员
   - 懒加载班级详情

---

## 9. 相关文档

- `DATABASE_SCHEMA_V2.md` - 数据库设计文档 V2.1
- `NEW_LOGIN_FLOW.md` - 新登录流程详细说明
- `PERMISSION_GUIDE.md` - 权限管理开发指引
- `DATABASE_PERMISSIONS.md` - 数据库权限配置说明

---

**优化完成日期**: 2026-03-18  
**优化版本**: V2.1  
**优化负责人**: Claude AI  
**测试状态**: 待测试  
**部署状态**: 待部署
