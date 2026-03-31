# 微信小程序认证流程说明

## 1. 核心设计理念

### 1.1 微信登录机制

微信小程序的登录流程非常简单，不需要传统的用户名和密码：

1. **自动获取OpenID**：用户点击"微信授权登录"按钮后，通过云函数自动获取用户的OpenID
2. **OpenID是唯一标识**：每个用户在小程序中都有唯一的OpenID，作为用户的身份标识
3. **无需密码**：微信已经完成了身份验证，小程序只需获取用户授权即可

### 1.2 数据隔离实现

**关键思路**：用户可以在多个班级中拥有不同角色，因此：

- **users表**：只存储用户的基本信息（OpenID、昵称、头像等）
- **user_class_relation表**：存储用户与班级的关系，包括角色信息
- **一个用户可以有多个班级关系**：在不同班级中可以有不同角色

---

## 2. 数据库设计详解

### 2.1 users 表（用户基本信息）

**用途**：存储用户的基本身份信息

**字段说明**：

```javascript
{
  _id: String,              // 自动生成的ID
  _openid: String,          // 用户OpenID（业务主键，唯一）
  nickname: String,         // 微信昵称
  avatarUrl: String,        // 微信头像URL
  name: String,             // 真实姓名（可选，在创建/加入班级时填写）
  phone: String,            // 手机号（可选）
  last_login: Date,         // 最后登录时间
  is_active: Boolean,       // 是否激活
  created_at: Date,         // 创建时间
  updated_at: Date          // 更新时间
}
```

**重要说明**：
- ❌ **不存储**：角色（role）、班级ID（class_id）、学号（student_id）
- ✅ **原因**：用户可以在多个班级中有不同身份，这些信息存储在 `user_class_relation` 表中

### 2.2 user_class_relation 表（用户班级关系）

**用途**：存储用户与班级的关联关系，包括角色信息

**字段说明**：

```javascript
{
  _id: String,              // 自动生成的ID
  user_openid: String,      // 用户OpenID（关联users._openid）
  class_id: String,         // 班级ID（关联classes._id）
  role: String,             // 角色：head_teacher/subject_teacher/student/parent
  is_owner: Boolean,        // 是否为班级创建者
  student_id: String,       // 学生学号（学生或家长身份时使用）
  status: String,           // 状态：joined/pending/rejected/left
  join_time: Date,          // 加入时间
  leave_time: Date,         // 离开时间
  apply_info: {             // 申请信息
    name: String,           // 申请人姓名
    phone: String,          // 申请人手机号
    subject: String,        // 老师科目
    relation: String        // 家长与学生的关系
  },
  approval_info: {          // 审批信息
    approver_openid: String,// 审批人OpenID
    approver_name: String,  // 审批人姓名
    approval_time: Date,    // 审批时间
    approval_comment: String// 审批意见
  },
  created_at: Date,         // 创建时间
  updated_at: Date          // 更新时间
}
```

**关键特点**：
- ✅ 一个用户可以有多条记录（加入多个班级）
- ✅ 每条记录代表一个用户在一个班级中的身份
- ✅ 支持不同班级中的不同角色

**示例数据**：

```javascript
// 张老师在班级A是班主任
{
  user_openid: 'openid_zhang',
  class_id: 'class_a',
  role: 'head_teacher',
  is_owner: true,
  status: 'joined'
}

// 张老师在班级B是科任老师
{
  user_openid: 'openid_zhang',
  class_id: 'class_b',
  role: 'subject_teacher',
  is_owner: false,
  status: 'joined'
}

// 李同学在班级A是学生
{
  user_openid: 'openid_li',
  class_id: 'class_a',
  role: 'student',
  student_id: '2024001',
  status: 'joined'
}

// 王家长在班级A是家长（关联学生李同学）
{
  user_openid: 'openid_wang',
  class_id: 'class_a',
  role: 'parent',
  student_id: '2024001',
  status: 'joined'
}
```

---

## 3. 完整的用户流程

### 3.1 首次使用流程

```
1. 用户打开小程序
   ↓
2. 显示登录页面
   ↓
3. 点击"微信授权登录"按钮
   ↓
4. 自动获取OpenID
   ↓
5. 创建users记录（如果不存在）
   ↓
6. 跳转到欢迎页
   ↓
7. 欢迎页显示"您还没有加入任何班级"
   ↓
8. 用户选择：
   ├─ 创建班级
   │   ↓
   │   填写班级信息 + 班主任信息
   │   ↓
   │   创建classes记录
   │   ↓
   │   创建user_class_relation记录（role: head_teacher, is_owner: true）
   │   ↓
   │   显示班级码
   │   ↓
   │   返回欢迎页
   │
   └─ 加入班级
       ↓
       输入班级码或老师手机号
       ↓
       查找班级
       ↓
       选择身份（老师/学生/家长）
       ↓
       填写身份信息
       ↓
       创建user_class_relation记录
       ↓
       返回欢迎页
```

### 3.2 再次使用流程

```
1. 用户打开小程序
   ↓
2. 自动登录（使用缓存的OpenID）
   ↓
3. 跳转到欢迎页
   ↓
4. 显示已加入的班级列表
   ↓
5. 用户选择班级
   ↓
6. 设置全局变量：
   - class_id = 选择的班级ID
   - role = 在该班级中的角色
   - student_id = 关联的学生学号（如果是学生或家长）
   ↓
7. 跳转到首页（显示功能菜单）
```

---

## 4. 全局变量管理

### 4.1 app.globalData 说明

```javascript
globalData: {
  userInfo: null,        // 用户基本信息（昵称、头像等）
  openid: null,          // 用户OpenID（唯一标识）
  class_id: null,        // 当前选择的班级ID
  role: null,            // 当前班级中的角色
  student_id: null,      // 关联的学生学号（学生或家长身份）
  currentSemester: null, // 当前学期
  envId: null           // 云开发环境ID
}
```

### 4.2 变量设置时机

| 变量 | 设置时机 | 数据来源 |
|------|---------|---------|
| `userInfo` | 登录成功时 | 微信授权 |
| `openid` | 登录成功时 | 云函数获取 |
| `class_id` | 选择班级时 | user_class_relation.class_id |
| `role` | 选择班级时 | user_class_relation.role |
| `student_id` | 选择班级时 | user_class_relation.student_id |

### 4.3 变量清除时机

- **小程序启动时**：清除 `class_id`、`role`、`student_id`（确保数据隔离正确）
- **退出班级时**：清除 `class_id`、`role`、`student_id`
- **切换班级时**：重新设置 `class_id`、`role`、`student_id`

---

## 5. 关键代码实现

### 5.1 登录流程（login.js）

```javascript
// 用户点击"微信授权登录"按钮
onGetUserInfo: async function (e) {
  // 1. 调用云函数获取OpenID
  const loginRes = await app.login();
  const openid = loginRes.openid;

  // 2. 获取用户信息
  const userInfo = e.detail.userInfo;

  // 3. 保存到users表
  await api.userApi.addUser({
    _openid: openid,
    nickname: userInfo.nickName,
    avatarUrl: userInfo.avatarUrl
  });

  // 4. 更新全局变量
  app.globalData.userInfo = userInfo;
  app.globalData.openid = openid;

  // 5. 跳转到欢迎页
  wx.redirectTo({ url: '/pages/welcome/welcome' });
}
```

### 5.2 创建班级（class/add/add.js）

```javascript
// 用户填写班级信息后提交
onSubmit: async function () {
  const db = wx.cloud.database();

  // 1. 创建classes记录
  const classData = {
    class_name: '2024级计算机1班',
    class_code: 'ABC123',
    creator_id: app.globalData.openid,
    // ...其他字段
  };
  const classRes = await db.collection('classes').add({ data: classData });

  // 2. 创建user_class_relation记录
  const relationData = {
    user_openid: app.globalData.openid,
    class_id: classRes._id,
    role: 'head_teacher',
    is_owner: true,
    status: 'joined',
    join_time: db.serverDate()
  };
  await db.collection('user_class_relation').add({ data: relationData });

  // 3. 显示成功提示
  util.showSuccess('创建成功');
}
```

### 5.3 选择班级（welcome.js）

```javascript
// 用户点击班级卡片
onEnterClass: function (e) {
  const classItem = e.currentTarget.dataset.item;

  // 1. 设置全局变量
  app.globalData.class_id = classItem._id;
  app.globalData.role = classItem.role;
  app.globalData.student_id = classItem.student_id || null;

  // 2. 保存到本地存储
  wx.setStorageSync('class_id', classItem._id);
  wx.setStorageSync('role', classItem.role);
  if (classItem.student_id) {
    wx.setStorageSync('student_id', classItem.student_id);
  }

  // 3. 跳转到首页
  wx.switchTab({ url: '/pages/index/index' });
}
```

---

## 6. 数据隔离实现

### 6.1 查询数据时的隔离

```javascript
// app.js中的buildDataQuery方法
buildDataQuery: function (collectionName, extraQuery = {}) {
  const role = this.globalData.role;
  const classId = this.globalData.class_id;
  const studentId = this.globalData.student_id;

  let query = { ...extraQuery };

  if (role === 'head_teacher' || role === 'subject_teacher') {
    // 教师：查看本班数据
    query.class_id = classId;
  } else if (role === 'student' || role === 'parent') {
    // 学生/家长：仅查看自己（或关联学生）的数据
    query.student_id = studentId;
  }

  return query;
}
```

### 6.2 写入数据时的隔离

```javascript
// 添加积分记录时
const recordData = {
  student_id: studentId,
  class_id: app.globalData.class_id, // 从全局变量获取
  score_change: 5,
  reason: '积极回答问题'
};
await db.collection('score_records').add({ data: recordData });
```

---

## 7. 常见问题解答

### Q1: 为什么不在users表中存储角色信息？

**A**: 因为一个用户可以在多个班级中拥有不同角色。例如：
- 张老师在班级A是班主任
- 张老师在班级B是科任老师

如果将角色存储在users表中，就无法支持这种多角色场景。

### Q2: 用户第一次登录后，如何确定其身份？

**A**: 用户在创建或加入班级时确定身份：
- 创建班级 → 自动成为班主任（head_teacher）
- 加入班级 → 选择身份（老师/学生/家长）

### Q3: 如何处理用户在多个班级的情况？

**A**: 在welcome页面显示所有已加入的班级列表，用户选择要进入的班级后：
1. 设置全局变量 `class_id`、`role`、`student_id`
2. 跳转到首页，显示该班级的功能菜单
3. 所有数据操作都基于选择的班级进行隔离

### Q4: 用户如何切换班级？

**A**: 在首页或个人中心提供"切换班级"按钮：
```javascript
onChangeClass: function () {
  // 清除当前班级信息
  app.globalData.class_id = null;
  app.globalData.role = null;
  app.globalData.student_id = null;
  
  // 跳转到欢迎页重新选择
  wx.redirectTo({ url: '/pages/welcome/welcome' });
}
```

### Q5: 如何处理家长和学生之间的关联？

**A**: 通过 `student_id` 字段关联：
- 学生记录：`{ role: 'student', student_id: '2024001' }`
- 家长记录：`{ role: 'parent', student_id: '2024001' }`

两者使用相同的 `student_id`，家长查看数据时会自动过滤出该学生的数据。

---

## 8. 数据库索引建议

### 8.1 users 表

```javascript
// OpenID唯一索引
db.collection('users').createIndex({
  keys: { _openid: 1 },
  options: { unique: true }
});
```

### 8.2 user_class_relation 表

```javascript
// 用户和班级的复合唯一索引（一个用户在一个班级中只能有一条记录）
db.collection('user_class_relation').createIndex({
  keys: { user_openid: 1, class_id: 1 },
  options: { unique: true }
});

// 用户OpenID索引（查询用户的所有班级）
db.collection('user_class_relation').createIndex({
  keys: { user_openid: 1 }
});

// 班级ID索引（查询班级的所有成员）
db.collection('user_class_relation').createIndex({
  keys: { class_id: 1 }
});
```

---

## 9. 测试清单

### 9.1 登录测试

- [ ] 首次登录，users表创建新记录
- [ ] 再次登录，users表更新last_login
- [ ] 登录成功后跳转到欢迎页
- [ ] 自动登录（使用缓存的OpenID）

### 9.2 创建班级测试

- [ ] 创建classes记录成功
- [ ] 创建user_class_relation记录成功
- [ ] 角色自动设置为head_teacher
- [ ] is_owner自动设置为true

### 9.3 加入班级测试

- [ ] 通过班级码查找班级成功
- [ ] 选择身份（老师/学生/家长）
- [ ] 创建user_class_relation记录成功
- [ ] 角色正确设置

### 9.4 选择班级测试

- [ ] 显示用户加入的所有班级
- [ ] 点击班级后设置全局变量
- [ ] 跳转到首页成功
- [ ] 数据隔离正确

---

**文档版本**: 1.0  
**创建日期**: 2026-03-18  
**最后更新**: 2026-03-18  
**相关文档**: NEW_LOGIN_FLOW.md, DATABASE_SCHEMA_V2.md
