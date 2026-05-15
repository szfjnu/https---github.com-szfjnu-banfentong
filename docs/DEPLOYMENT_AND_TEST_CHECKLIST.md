# 部署检查清单与回归测试用例

## 一、部署前准备

### 1. 云数据库索引创建

**方式A：调用setupIndexes云函数（推荐）**
1. 在微信开发者工具中上传部署 `setupIndexes` 云函数
2. 在云开发控制台 → 云函数 → 调用 `setupIndexes`，参数：
   ```json
   { "action": "setupAll" }
   ```
3. 检查返回结果，确认 `summary.failed === 0`
4. 如有失败的索引，针对性重试：
   ```json
   { "action": "setupCollection", "collection": "失败的集合名" }
   ```

**方式B：手动在云控制台创建（备选）**
- 核心唯一索引（必须创建）：
  - `users._openid` (unique)
  - `user_class_relation.{user_openid, class_id}` (unique, 复合)
  - `classes.class_id` (unique)
  - `classes.class_code` (unique)
  - `students.student_id` (unique)
  - `scores.{student_id, class_id}` (unique)
  - `dorm_score_accounts.{student_id, class_id, semester_id}` (unique)
  - `treehole_hearts.{post_id, user_id}` (unique)
  - `hero_cheers.{honor_id, user_id}` (unique)
  - `class_settings.class_id` (unique)
  - `seats.class_id` (unique)

### 2. 需要预先创建的数据库集合

以下集合可能尚未在云数据库中创建，需确保存在：
- `duty_schedule` — 值日排班
- `duty_tasks` — 值日任务
- `score_rule_versions` — 积分规则版本
- `score_appeals` — 积分申诉
- `score_reset_logs` — 积分重置日志
- `score_anomaly_alerts` — 积分异常告警
- `permission_audit_logs` — 权限审计日志
- `user_settings` — 用户设置
- ` ` — 学生状态

> 提示：setupIndexes 云函数会自动创建缺失的集合，也可在云控制台手动创建。

---

## 二、云函数部署顺序

按依赖关系排序，先部署被其他函数依赖的模块：

### 第1批：基础设施
| 云函数 | 修改内容 | 优先级 |
|--------|---------|--------|
| `login` | 新增ensureUser/initUserMembership action | P0 |
| `setupIndexes` | 新建，索引初始化 | P0 |

### 第2批：核心业务
| 云函数 | 修改内容 | 优先级 |
|--------|---------|--------|
| `joinClass` | auth+allowNoClass+6个新action(addStudent/updateStudent/deleteStudent/addRelation/updateRelation/deleteRelation) | P0 |
| `scoreManager` | auth+13个新action(addScoreRecord/deleteScoreItem/addScoreCategory/updateScoreCategory/addGroup/updateGroup/deleteGroup/submitAppeal/createVersionSnapshot/createInitialVersion/rollbackVersion/getScores/getGroups) | P0 |
| `manageUserCenter` | caller.openid修复+updateUser/initUserMembership/listUsers/updateUserRole/updateUserMembership/getPermissionAuditLog | P0 |
| `manageSemester` | auth+saveResetSettings | P1 |
| `processRedemption` | auth+addItem/updateItem/updateRequest/shipRedemption | P1 |

### 第3批：宿舍与考勤
| 云函数 | 修改内容 | 优先级 |
|--------|---------|--------|
| `convertDormScore` | auth+addDormScoreRecord action | P1 |
| `dormSyncManager` | auth+7个新action | P1 |
| `importDormRules` | auth+action路由重构 | P1 |
| `attendanceWarning` | auth+addCategory等action | P1 |
| `checkDormWarnings` | auth | P2 |
| `generateDormStatistics` | auth | P2 |

### 第4批：权限与授权
| 云函数 | 修改内容 | 优先级 |
|--------|---------|--------|
| `manageAuthorization` | auth+委派模块 | P1 |
| `manageDuty` | auth+requireTeacherOrDelegated | P1 |
| `dataTransfer` | auth+importStudents映射+权限配置 | P1 |

### 第5批：其他业务
| 云函数 | 修改内容 | 优先级 |
|--------|---------|--------|
| `auctionManager` | event.openid→caller.openid修复 | P0 |
| `fleaMarketManager` | auth重构 | P2 |
| `campusActivity` | auth | P2 |
| `treeHoleManager` | auth | P2 |
| `heroManager` | auth+caller.role修复 | P2 |
| `approvalWorkflow` | auth+caller替换 | P2 |
| `growthManager` | auth | P2 |
| `gradeManager` | auth | P2 |
| `manageSchedule` | auth模块替换 | P2 |
| `manageSeat` | auth模块替换 | P2 |
| `manageDiscipline` | auth+事务+软删除检测 | P1 |
| `resetStudentScore` | auth+action路由 | P1 |
| `updateStudentScore` | auth+参数兼容 | P1 |
| `deleteRecordWithScore` | auth+嵌套参数兼容 | P1 |
| `deleteDormRecord` | auth | P2 |
| `handleBidAuction` | auth | P2 |
| `generateAIReview` | auth | P2 |
| `fixClassSettings` | auth | P2 |
| `initDatabase` | requireAdmin | P2 |
| `initScoreCategories` | requireAdmin | P2 |
| `validateRuleEngine` | auth | P2 |
| `aiNpc` | auth | P2 |

### 部署步骤（每个云函数）
1. 微信开发者工具 → 云开发 → 云函数 → 右键对应函数 → 上传并部署：云端安装依赖
2. 等待部署完成（状态变为"已部署"）
3. 在云函数测试面板调用简单action验证部署成功

---

## 三、小程序端部署

1. 确认 `app.json` 分包配置正确（5个subPackages）
2. 检查主包大小 < 2MB：`微信开发者工具 → 详情 → 本地代码`
3. 检查每个分包大小 < 2MB
4. 上传代码：工具栏 → 上传 → 填写版本号和备注
5. 提交审核：微信公众平台 → 版本管理 → 提交审核

---

## 四、回归测试用例

### A. 登录与权限（P0）

| 编号 | 测试场景 | 前置条件 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|---------|
| A-01 | 新用户首次登录 | 未注册用户 | 打开小程序，授权登录 | 自动创建users记录，角色student |
| A-02 | 新用户创建班级 | 未加入任何班级 | 点击创建班级，填写信息 | 成功创建，自动成为班主任，创建user_class_relation |
| A-03 | 新用户加入班级 | 有有效邀请码 | 输入邀请码加入 | 成功加入，角色student |
| A-04 | 免费用户创建班级 | 免费会员 | 创建班级 | 不提示会员限制，直接创建成功 |
| A-05 | 多班级用户切换 | 已加入2个班级 | 切换当前班级 | 角色和信息正确切换 |

### B. 用户中心（P0 - manageUserCenter修复验证）

| 编号 | 测试场景 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|
| B-01 | 查看个人资料 | 进入个人中心 | 正确显示昵称、头像、角色 |
| B-02 | 修改个人资料 | 修改昵称，保存 | 保存成功，页面刷新显示新昵称 |
| B-03 | 查看用户设置 | 进入设置页 | 设置项正确加载 |
| B-04 | 修改通知偏好 | 关闭某类通知 | 保存成功 |
| B-05 | 查看学生详情 | 班主任点击某学生 | 正确显示学生信息和积分 |
| B-06 | 编辑学生信息 | 修改学生手机号 | 保存成功 |

### C. 积分管理（P0 - scoreManager修复验证）

| 编号 | 测试场景 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|
| C-01 | 录入积分 | 选择学生+积分项+提交 | 积分记录创建，学生总分更新 |
| C-02 | 删除积分规则 | 长按某积分项→删除 | 规则软删除成功 |
| C-03 | 添加积分分类 | 新增分类名 | 分类创建成功 |
| C-04 | 更新积分分类 | 修改分类名 | 更新成功 |
| C-05 | 添加分组 | 创建新分组 | 分组创建成功 |
| C-06 | 删除分组 | 删除某分组 | 分组删除成功 |
| C-07 | 提交积分申诉 | 学生对记录申诉 | 申诉记录创建 |
| C-08 | 创建规则版本快照 | 保存当前规则 | 版本快照创建成功 |
| C-09 | 获取学生积分列表 | 座位管理页加载 | 正确返回积分数据 |
| C-10 | 获取分组列表 | 座位管理页加载 | 正确返回分组数据 |

### D. 班级与学生管理（P0 - joinClass修复验证）

| 编号 | 测试场景 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|
| D-01 | 添加学生 | 手动输入学生信息→添加 | 学生记录+user_class_relation同时创建 |
| D-02 | 更新学生 | 修改学生姓名 | 更新成功 |
| D-03 | 删除学生 | 移除某学生 | 学生状态变removed，user_class_relation同步 |
| D-04 | 添加用户关系 | 添加用户-班级关系 | 关系创建成功，检测重复 |
| D-05 | Excel导入学生 | 上传Excel | 字段映射正确，数据导入成功 |

### E. 拍卖管理（P0 - auctionManager修复验证）

| 编号 | 测试场景 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|
| E-01 | 查看出价历史 | 查看某拍卖品出价 | 仅自己的user_id可见，其他人脱敏 |

### F. 兑换商城（P1）

| 编号 | 测试场景 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|
| F-01 | 添加兑换物品 | 管理后台新增物品 | 物品创建成功 |
| F-02 | 更新兑换物品 | 修改积分价格 | 更新成功 |
| F-03 | 发货 | 点击发货 | 状态变为已发货 |

### G. 宿舍管理（P1-P2）

| 编号 | 测试场景 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|
| G-01 | 添加宿舍积分记录 | 录入宿舍扣分 | dorm_score_records创建+积分账户同步 |
| G-02 | 宿舍积分折算 | 折算到个人积分 | 个人积分同步更新 |
| G-03 | 导入宿舍规则 | 上传规则Excel | 规则正确导入 |

### H. 权限与委派（P1）

| 编号 | 测试场景 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|
| H-01 | 班主任授权学生 | 授权积分记录模块 | student_authorizations创建 |
| H-02 | 被授权学生操作 | 被授权学生录入积分 | 操作成功 |
| H-03 | 未授权学生操作 | 未授权学生尝试录入 | 提示权限不足 |

### I. 积分重置（P1）

| 编号 | 测试场景 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|
| I-01 | 批量重置积分 | 选择班级→批量重置 | 所有学生积分恢复初始值 |
| I-02 | 保存重置设置 | 配置重置规则→保存 | 设置保存到class_settings |

### J. 通知系统（P0 - manageUserCenter修复验证）

| 编号 | 测试场景 | 操作步骤 | 预期结果 |
|------|---------|---------|---------|
| J-01 | 获取通知列表 | 进入通知页 | 正确加载通知 |
| J-02 | 标记已读 | 点击某通知 | 状态变已读 |
| J-03 | 全部标记已读 | 点击全部已读 | 所有通知标记已读 |
| J-04 | 获取未读数 | 首页加载 | 未读数正确显示 |

---

## 五、部署后验证

1. 调用 `setupIndexes` → 确认所有索引创建成功
2. 调用 `login` → ensureUser → 确认users记录存在
3. 调用 `joinClass` → getUserClasses → 确认班级列表正确
4. 调用 `scoreManager` → getScoreItems → 确认积分项加载
5. 调用 `manageUserCenter` → getUserProfile → 确认用户资料加载（**重点验证P0-1修复**）
6. 调用 `auctionManager` → getBidHistory → 确认出价历史脱敏正确（**重点验证P0-4修复**）

---

## 六、已知待后续优化项

| 项目 | 风险级别 | 说明 |
|------|---------|------|
| 客户端db.serverDate() | P2 | api.js中十余处在客户端设置serverDate传给云函数，序列化可能不一致。建议统一改为云函数内部设置时间戳 |
| 数据库安全规则 | P2 | 集合权限规则需审查，确保"所有者可读"规则的集合通过云函数读取 |
| 大数据量分页 | P3 | 部分列表查询未使用batchQuery，超过20条时数据不全 |
