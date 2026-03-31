# 简化登录流程说明

## 1. 问题分析

### 1.1 原有问题

1. **登录流程复杂**：需要选择角色、输入学号等信息，用户体验不佳
2. **数据关系混乱**：users表和user_class_relation表职责不清晰
3. **角色确定时机错误**：在登录时确定角色，而不是在加入班级时确定

### 1.2 用户疑问

1. **点击班级跳转到index而非详情页**：这是正确的，因为用户选择班级后应该进入首页（功能菜单）
2. **数据库中没有关联记录**：
   - users表：应该在登录时创建
   - user_class_relation表：应该在创建/加入班级时创建
3. **是否需要输入用户名密码**：不需要，微信小程序使用openid自动识别用户

---

## 2. 新的登录流程设计

### 2.1 简化后的流程

```
用户点击登录
  ↓
微信授权获取用户信息 + openid
  ↓
创建/更新 users 表记录
  ↓
跳转到 welcome 页面
  ↓
显示已加入的班级列表（首次为空）
  ↓
  ├─ 创建班级 → 自动创建 user_class_relation（role='head_teacher', is_owner=true）
  ├─ 加入班级 → 根据选择创建 user_class_relation（role='student'/'parent'/'teacher'）
  └─ 点击班级 → 从 user_class_relation 获取角色 → 设置全局变量 → 进入首页
```

### 2.2 核心改动

#### 2.2.1 登录页面简化

**修改前**：
- 选择角色（admin, head_teacher, student等）
- 学生/家长需要输入学号
- 点击"微信授权登录"

**修改后**：
- 直接点击"微信授权登录"
- 自动获取openid和用户基本信息
- 跳转到welcome页面

**关键代码**：
```javascript
// login.js - 简化后的登录逻辑
onGetUserInfo: async function (e) {
  // 1. 获取openid
  const loginRes = await app.login();
  const openid = loginRes.openid;

  // 2. 获取用户基本信息
  const userInfo = e.detail.userInfo;

  // 3. 创建/更新 users 表
  this.saveUserInfo(openid, userInfo, dbUser);

  // 4. 跳转到welcome页面
  wx.redirectTo({ url: '/pages/welcome/welcome' });
}
```

#### 2.2.2 角色确定时机

**修改前**：登录时确定角色，保存在users表

**修改后**：在创建/加入班级时确定角色，保存在user_class_relation表

```javascript
// 创建班级时
const relationData = {
  user_openid: openid,
  class_id: classId,
  role: 'head_teacher',  // 创建者自动成为班主任
  is_owner: true,        // 创建者拥有管理权限
  status: 'joined',
  join_time: db.serverDate()
};

// 加入班级时（老师）
const relationData = {
  user_openid: openid,
  class_id: classId,
  role: 'teacher',       // 选择身份为老师
  is_owner: false,
  status: 'joined',
  join_time: db.serverDate()
};

// 加入班级时（家长）
const relationData = {
  user_openid: openid,
  class_id: classId,
  role: 'parent',        // 选择身份为家长
  is_owner: false,
  student_id: studentId, // 关联学生
  status: 'joined',
  join_time: db.serverDate()
};
```

#### 2.2.3 全局变量管理

**app.js 全局变量**：
```javascript
globalData: {
  userInfo: null,        // 用户基本信息（头像、昵称等）
  openid: null,          // 用户openid（唯一标识）
  class_id: null,        // 当前选择的班级ID（用于数据隔离）
  student_id: null,      // 学生学号（学生或家长身份时使用）
  role: null,            // 当前角色（从user_class_relation获取）
  currentSemester: null, // 当前学期
  envId: null           // 云开发环境ID
}
```

**变量设置时机**：
1. `openid` 和 `userInfo`：登录成功后设置
2. `class_id`、`student_id`、`role`：选择班级后从user_class_relation获取并设置

---

## 3. 数据库设计说明

### 3.1 users 表

**用途**：存储用户的基本信息

**创建时机**：用户首次登录时

**字段说明**：
```javascript
{
  _id: String,              // 自动生成的ID
  _openid: String,          // 用户openid（唯一标识）
  nickname: String,         // 微信昵称
  avatarUrl: String,        // 微信头像URL
  name: String,             // 真实姓名（可选，后续填写）
  phone: String,            // 手机号（可选，后续填写）
  last_login: Date,         // 最后登录时间
  is_active: Boolean,       // 是否激活
  created_at: Date,         // 创建时间
  updated_at: Date          // 更新时间
}
```

**注意**：
- users表不存储角色信息
- users表不存储班级ID
- users表仅存储用户的基本身份信息

### 3.2 user_class_relation 表

**用途**：存储用户与班级的关系（角色在哪个班级）

**创建时机**：
1. 创建班级时（创建者）
2. 加入班级时（加入者）

**字段说明**：
```javascript
{
  _id: String,              // 自动生成的ID
  relation_id: String,      // 关系业务ID
  user_openid: String,      // 用户openid
  class_id: String,         // 班级ID
  role: String,             // 角色：head_teacher/subject_teacher/student/parent
  is_owner: Boolean,        // 是否为班级创建者/管理员
  student_id: String,       // 关联的学生学号（家长或学生身份时使用）
  status: String,           // 状态：joined/pending/rejected/left
  join_time: Date,          // 加入时间
  leave_time: Date,         // 离开时间
  apply_info: Object,       // 申请信息
  approval_info: Object,    // 审批信息
  created_at: Date,         // 创建时间
  updated_at: Date          // 更新时间
}
```

**注意**：
- 一个用户可以加入多个班级
- 一个用户在不同班级可以有不同角色
- 角色信息存储在此表中，而不是users表

### 3.3 classes 表

**用途**：存储班级的基本信息

**创建时机**：用户创建班级时

**字段说明**：
```javascript
{
  _id: String,              // 自动生成的ID
  class_id: String,         // 班级业务ID
  class_name: String,       // 班级名称
  class_code: String,       // 班级码（6位）
  grade: String,            // 年级
  school: String,           // 学校名称
  creator_id: String,       // 创建人openid
  creator_name: String,     // 创建人姓名
  creator_phone: String,    // 创建人手机号
  status: String,           // 班级状态
  created_at: Date,         // 创建时间
  updated_at: Date          // 更新时间
}
```

---

## 4. 数据关系图

```
users 表
  ├─ _openid (唯一标识)
  │
  └─→ user_class_relation 表 (一对多)
       ├─ user_openid (外键)
       ├─ class_id (外键)
       ├─ role (角色)
       └─ student_id (学生学号)
            │
            └─→ students 表
                 ├─ student_id (学号)
                 └─ class_id (所属班级)

user_class_relation 表
  └─→ classes 表 (多对一)
       ├─ class_id
       └─ class_code
```

---

## 5. 关键代码说明

### 5.1 欢迎页加载班级列表

```javascript
// welcome.js
loadMyClasses: async function () {
  const db = wx.cloud.database();

  // 查询用户已加入的班级
  const joinedRes = await db.collection('user_class_relation')
    .where({
      user_openid: app.globalData.openid,
      status: 'joined'
    })
    .get();

  // 获取班级详情
  const myClasses = await this.getClassDetails(joinedRes.data);
  this.setData({ myClasses });
}
```

### 5.2 进入班级时设置全局变量

```javascript
// welcome.js
onEnterClass: function (e) {
  const classItem = e.currentTarget.dataset.item;
  
  // 1. 保存班级ID
  app.globalData.class_id = classItem._id;
  wx.setStorageSync('class_id', classItem._id);
  
  // 2. 从关系表中获取的角色设置到全局变量
  app.globalData.role = classItem.role;
  wx.setStorageSync('role', classItem.role);
  
  // 3. 如果是学生或家长，保存关联的学号
  if (classItem.student_id) {
    app.globalData.student_id = classItem.student_id;
    wx.setStorageSync('student_id', classItem.student_id);
  }
  
  // 4. 跳转到首页
  wx.switchTab({ url: '/pages/index/index' });
}
```

### 5.3 创建班级时创建关系记录

```javascript
// class/add/add.js
onSubmit: async function () {
  // 1. 创建班级
  const result = await db.collection('classes').add({ data: saveData });

  // 2. 创建用户班级关系
  const relationData = {
    user_openid: app.globalData.openid,
    class_id: result._id,
    role: 'head_teacher',
    is_owner: true,
    status: 'joined',
    join_time: db.serverDate()
  };
  
  await db.collection('user_class_relation').add({ data: relationData });

  // 3. 保存班级ID到全局变量
  app.globalData.class_id = result._id;
  wx.setStorageSync('class_id', result._id);
}
```

---

## 6. 常见问题解答

### Q1: 为什么users表和user_class_relation表分开？

**A**: 因为一个用户可以加入多个班级，在不同班级中扮演不同角色。

**示例**：
- 张老师在"一班"是班主任（head_teacher）
- 张老师在"二班"是科任老师（subject_teacher）

如果合并到一个表，会导致数据冗余和更新困难。

### Q2: 登录时为什么不选择角色？

**A**: 因为用户的角色是在特定班级中的身份，不是全局的身份。

**对比**：
- ❌ 错误设计：登录时选择"我是班主任" → 一个用户只能有一个角色
- ✅ 正确设计：创建班级时自动成为班主任 → 一个用户在不同班级可以不同角色

### Q3: 为什么进入班级后才能使用功能？

**A**: 因为系统需要进行数据隔离。不同班级的数据是完全隔离的，用户必须先选择要操作的班级。

### Q4: 点击班级后跳转到index还是class/detail？

**A**: 应该跳转到index（首页），因为：
1. 用户选择班级后，应该看到该班级的功能菜单
2. class/detail 是班级详情页，用于查看班级信息，不是功能入口
3. index 页面应该根据用户的角色显示不同的功能菜单

### Q5: 如何实现一个用户多个班级？

**A**: 
1. 在welcome页面显示用户加入的所有班级
2. 用户可以点击不同的班级进行切换
3. 每次切换班级时，更新全局变量 `class_id` 和 `role`
4. 数据查询时使用 `class_id` 进行数据隔离

---

## 7. 测试清单

### 7.1 登录测试

- [ ] 首次登录，创建users记录
- [ ] 再次登录，更新users记录的last_login
- [ ] 登录成功后跳转到welcome页面
- [ ] 拒绝授权，提示需要授权

### 7.2 创建班级测试

- [ ] 创建班级成功，classes表有记录
- [ ] 创建班级成功，user_class_relation表有记录
- [ ] user_class_relation中role为head_teacher
- [ ] user_class_relation中is_owner为true
- [ ] 显示班级码
- [ ] 返回welcome页面，显示新创建的班级

### 7.3 加入班级测试

- [ ] 通过班级码查找班级成功
- [ ] 选择身份（老师/家长/学生）
- [ ] 加入成功，user_class_relation表有记录
- [ ] role与选择的身份一致
- [ ] 返回welcome页面，显示新加入的班级

### 7.4 进入班级测试

- [ ] 点击班级，设置全局变量class_id
- [ ] 点击班级，设置全局变量role
- [ ] 如果是家长/学生，设置全局变量student_id
- [ ] 跳转到首页成功
- [ ] 首页显示正确的班级数据

---

## 8. 注意事项

### 8.1 数据隔离

- 所有业务数据的查询必须使用 `class_id` 进行过滤
- 使用 `app.buildDataQuery()` 自动添加数据隔离条件

### 8.2 权限控制

- 使用 `app.hasPermission()` 检查权限
- 权限判断基于 `app.globalData.role`

### 8.3 多班级管理

- 用户切换班级时，需要重新设置全局变量
- 切换班级后，需要重新加载数据

---

**文档版本**: 1.0  
**创建日期**: 2026-03-18  
**最后更新**: 2026-03-18
