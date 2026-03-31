# 考勤管理系统 - 数据库设计文档

本文档定义了考勤管理系统所需的所有云数据库集合(表)的结构和字段。

---

## 1. `attendance_categories` (考勤类别表)

管理考勤的类别定义，每个类别对应不同的积分扣减规则。

- `_id`: String (自动生成的主键)
- `category_id`: String (类别ID, **业务主键**)
- `class_id`: String (所属班级ID, **必填**)
- `category_name`: String (类别名称, 如: "病假", "事假", "迟到", "早退", "旷课")
- `category_code`: String (类别代码, 如: "sick_leave", "personal_leave", "late", "early_leave", "absent")
- `score_deduction`: Number (积分扣减值, 负数表示扣分, 默认0)
- `description`: String (类别描述)
- `color`: String (显示颜色, 十六进制, 如: "#ff4d4f")
- `icon`: String (图标名称或emoji)
- `sort_order`: Number (排序权重, 默认0)
- `is_system`: Boolean (是否系统内置, 不可删除, 默认false)
- `is_active`: Boolean (是否启用, 默认true)
- `created_by`: String (创建人openid)
- `created_at`: Date (创建时间)
- `updated_at`: Date (更新时间)

**索引建议:**
- `{category_id: 1}` (唯一索引)
- `{class_id: 1, is_active: 1}` (按班级查询启用的类别)

**预设类别示例:**

| 类别名称 | 类别代码 | 积分扣减 | 颜色 |
|---------|---------|---------|------|
| 病假 | sick_leave | 0 | #52c41a |
| 事假 | personal_leave | 0 | #1890ff |
| 迟到 | late | -1 | #fa8c16 |
| 早退 | early_leave | -1 | #faad14 |
| 旷课 | absent | -5 | #ff4d4f |

---

## 2. `attendance_records` (考勤记录表)

记录学生的日常考勤情况。

- `_id`: String (自动生成的主键)
- `record_id`: String (记录ID, **业务主键**)
- `student_id`: String (学生ID, 关联到students)
- `student_name`: String (学生姓名)
- `class_id`: String (班级ID, 关联到classes)
- `date`: Date (考勤日期, **必填**)
- `category_id`: String (考勤类别ID, 关联到attendance_categories)
- `category_name`: String (考勤类别名称, 快照)
- `score_change`: Number (积分变化值, 默认0)
- `reason`: String (考勤原因/备注)
- `proof_images`: Array (证明图片URL列表)
- `proof_files`: Array (证明文件URL列表)
- `related_score_record_id`: String (关联积分记录ID)
- `recorder_openid`: String (记录人openid)
- `recorder_name`: String (记录人姓名)
- `recorder_role`: String (记录人角色)
- `semester_id`: String (学期ID, 关联到semesters)
- `created_at`: Date (创建时间)
- `updated_at`: Date (更新时间)

**索引建议:**
- `{record_id: 1}` (唯一索引)
- `{class_id: 1, date: -1}` (按班级和日期查询)
- `{student_id: 1, date: -1}` (按学生和日期查询)
- `{semester_id: 1}` (按学期查询)

---

## 3. `leave_approval_records` (请假审批记录表)

记录学生的请假审批信息，支持跨天请假。

- `_id`: String (自动生成的主键)
- `approval_id`: String (审批记录ID, **业务主键**)
- `student_id`: String (学生ID, 关联到students)
- `student_name`: String (学生姓名)
- `class_id`: String (班级ID, 关联到classes)
- `leave_type`: String (请假类型: "病假" / "事假" / "其他")
- `start_date`: Date (请假开始日期, **必填**)
- `end_date`: Date (请假结束日期, **必填**)
- `duration_days`: Number (请假天数)
- `reason`: String (请假原因)
- `approval_status`: String (审批状态: "approved"已通过 / "rejected"已拒绝 / "cancelled"已取消)
- `approval_number`: String (学校审批单号, 可选)
- `proof_images`: Array (审批凭证图片URL列表)
- `proof_files`: Array (审批凭证文件URL列表)
- `creator_openid`: String (创建人openid)
- `creator_name`: String (创建人姓名)
- `creator_role`: String (创建人角色: "student" / "head_teacher" / "attendance_admin")
- `semester_id`: String (学期ID, 关联到semesters)
- `created_at`: Date (创建时间)
- `updated_at`: Date (更新时间)

**索引建议:**
- `{approval_id: 1}` (唯一索引)
- `{class_id: 1, start_date: -1}` (按班级和日期查询)
- `{student_id: 1, start_date: -1}` (按学生和日期查询)
- `{class_id: 1, start_date: 1, end_date: 1}` (按日期范围查询)

---

## 4. `attendance_statistics` (考勤统计表)

按日期统计班级考勤情况，用于快速查询和展示。

- `_id`: String (自动生成的主键)
- `stat_id`: String (统计ID, **业务主键**)
- `class_id`: String (班级ID, 关联到classes)
- `date`: Date (统计日期, **必填**)
- `total_count`: Number (班级总人数)
- `present_count`: Number (实际出勤人数)
- `sick_leave_count`: Number (病假人数)
- `personal_leave_count`: Number (事假人数)
- `late_count`: Number (迟到人数)
- `early_leave_count`: Number (早退人数)
- `absent_count`: Number (旷课人数)
- `actual_attendance_rate`: Number (实际出勤率, 百分比)
- `assessment_attendance_rate`: Number (考核出勤率, 百分比)
- `semester_id`: String (学期ID, 关联到semesters)
- `created_at`: Date (创建时间)
- `updated_at`: Date (更新时间)

**业务逻辑:**
- 实际出勤率 = (总人数 - 病假 - 事假 - 旷课) / 总人数 × 100%
- 考核出勤率 = (总人数 - 旷课) / 总人数 × 100%

**索引建议:**
- `{stat_id: 1}` (唯一索引)
- `{class_id: 1, date: -1}` (唯一复合索引, 每个班级每天只有一条记录)
- `{semester_id: 1, class_id: 1}` (按学期和班级查询)

---

## 5. `attendance_administrators` (考勤管理员表)

记录班级授权的考勤管理员。

- `_id`: String (自动生成的主键)
- `admin_id`: String (管理员ID, **业务主键**)
- `class_id`: String (班级ID, 关联到classes)
- `student_id`: String (学生ID, 关联到students)
- `student_name`: String (学生姓名)
- `position`: String (职务, 如: "考勤班长", "考勤管理员")
- `authorized_by`: String (授权人openid)
- `authorized_name`: String (授权人姓名)
- `authorized_at`: Date (授权时间)
- `permissions`: Array (权限列表, 如: ["view", "create", "edit"])
- `is_active`: Boolean (是否激活, 默认true)
- `created_at`: Date (创建时间)
- `updated_at`: Date (更新时间)

**索引建议:**
- `{admin_id: 1}` (唯一索引)
- `{class_id: 1, is_active: 1}` (按班级查询激活的管理员)
- `{student_id: 1}` (按学生查询)

---

## 6. `full_attendance_statistics` (全勤统计表)

统计学生每周、每月、每学期的全勤情况。

- `_id`: String (自动生成的主键)
- `stat_id`: String (统计ID, **业务主键**)
- `student_id`: String (学生ID, 关联到students)
- `student_name`: String (学生姓名)
- `class_id`: String (班级ID, 关联到classes)
- `stat_type`: String (统计类型: "week" / "month" / "semester")
- `stat_period`: String (统计周期, 如: "2026-W12" / "2026-03" / "2025-2026-1")
- `start_date`: Date (统计开始日期)
- `end_date`: Date (统计结束日期)
- `total_days`: Number (应出勤天数)
- `actual_attendance_days`: Number (实际全勤天数)
- `is_full_attendance`: Boolean (是否全勤)
- `sick_leave_days`: Number (病假天数)
- `personal_leave_days`: Number (事假天数)
- `late_count`: Number (迟到次数)
- `early_leave_count`: Number (早退次数)
- `absent_count`: Number (旷课次数)
- `semester_id`: String (学期ID, 关联到semesters)
- `created_at`: Date (创建时间)
- `updated_at`: Date (更新时间)

**业务逻辑:**
- 实际全勤：无病假、事假、旷课（迟到、早退不算缺勤���
- 应出勤天数：学期内的工作日天数（排除周末、节假日）

**索引建议:**
- `{stat_id: 1}` (唯一索引)
- `{class_id: 1, stat_type: 1, stat_period: -1}` (按班级和类型查询)
- `{student_id: 1, stat_type: 1}` (按学生和类型查询)
- `{class_id: 1, is_full_attendance: 1, stat_period: -1}` (查询全勤学生)

---

## 数据关联关系

```
attendance_categories (考勤类别)
    ↓ (category_id)
attendance_records (考勤记录) → score_records (积分记录)
    ↓ (student_id)
students (学生信息)

leave_approval_records (请假审批) → attendance_records (生成考勤记录)
    ↓ (student_id)
students (学生信息)

attendance_statistics (考勤统计) ← attendance_records (汇总计算)
    ↓ (class_id)
classes (班级信息)

full_attendance_statistics (全勤统计) ← attendance_records (汇总计算)
```

---

## 业务流程

### 1. 日常考勤记录流程
1. 班主任/考勤管理员选择日期
2. 查看学生列表，标记考勤状态
3. 系统自动计算积分变化
4. 创建 `attendance_records` 记录
5. 同步创建 `score_records` 积分记录
6. 更新 `attendance_statistics` 统计数据

### 2. 请假审批记录流程
1. 学生/班主任/考勤管理员创建请假记录
2. 上传审批凭证图片/文件
3. 创建 `leave_approval_records` 记录
4. 系统自动生成对应日期的 `attendance_records` (病假/事假)
5. 更新 `attendance_statistics` 统计数据

### 3. 删除考勤记录流程
1. 删除 `attendance_records` 记录
2. 同步删除关联的 `score_records` 记录
3. 重新计算学生积分
4. 更新 `attendance_statistics` 统计数据

### 4. 全勤统计流程
1. 定时任务或手动触发
2. 按 周/月/学期 统计每个学生的考勤情况
3. 创建或更新 `full_attendance_statistics` 记录

---

**版本**: 1.0  
**创建日期**: 2026-03-24  
**基于需求**: 考勤管理功能优化需求