# 班级积分管理系统 - 数据库设计文档 V2.0

本文档定义了班级积分管理小程序所需的所有云数据库集合(表)的结构和字段,基于最新的25个需求文档。

---

## 1. `classes` (班级信息表)

存储班级的基本信息，是数据隔离的核心表。

-   `_id`: String (自动生成的主键)
-   `class_id`: String (班级ID, **业务主键, 需确保唯一**)
-   `class_name`: String (班级名称, 如: "2024级计算机1班")
-   `class_code`: String (班级码, 6位数字字母组合, 用于加入班级)
-   `grade`: String (年级, 如: "职校一年级")
-   `grade_type`: String (学段类型, 如: "vocational", "high_school", "middle_school"等)
-   `school`: String (学校名称)
-   `creator_id`: String (创建人openid, 关联到users)
-   `creator_name`: String (创建人姓名)
-   `creator_phone`: String (创建人手机号)
-   `subject`: String (创建人科目, 老师创建时填写)
-   `student_count`: Number (预计学生人数)
-   `status`: String (班级状态: "active" / "archived" / "deleted")
-   `current_semester_id`: String (当前学期ID, 关联到semesters)
-   `settings`: Object (班级设置)
    -   `initial_score`: Number (初始积分, 默认100)
    -   `dorm_initial_score`: Number (住宿积分初始值, 默认100)
    -   `dorm_conversion_ratio`: Number (住宿积分折算比例, 默认0.3)
    -   `enable_dorm_management`: Boolean (是否启用宿舍管理)
    -   `enable_volunteer`: Boolean (是否启用志愿服务)
    -   `enable_competition`: Boolean (是否启用竞赛管理)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

**索引建议**:
- `class_id` (唯一索引)
- `class_code` (唯一索引)
- `creator_id`
- `status`

---

## 2. `user_class_relation` (用户与班级关系表)

存储用户与班级的关联关系，实现多班级数据隔离。

-   `_id`: String (自动生成的主键)
-   `relation_id`: String (关系ID, **业务主键**)
-   `user_openid`: String (用户openid, 关联到users._openid)
-   `class_id`: String (班级ID, 关联到classes.class_id)
-   `role`: String (在班级中的角色: "head_teacher" / "subject_teacher" / "student" / "parent")
-   `is_owner`: Boolean (是否为班级创建者/管理员, 创建班级时自动设为true)
-   `student_id`: String (关联的学生学号, 学生或家长身份时填写)
-   `status`: String (状态: "joined" / "pending" / "rejected" / "left")
-   `join_time`: Date (加入时间)
-   `leave_time`: Date (离开时间, 退出班级时填写)
-   `apply_info`: Object (申请信息)
    -   `name`: String (申请人姓名)
    -   `phone`: String (申请人手机号)
    -   `subject`: String (老师科目)
    -   `relation`: String (家长与学生的关系)
-   `approval_info`: Object (审批信息)
    -   `approver_openid`: String (审批人openid)
    -   `approver_name`: String (审批人姓名)
    -   `approval_time`: Date (审批时间)
    -   `approval_comment`: String (审批意见)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

**索引建议**:
- `user_openid`
- `class_id`
- `status`
- 复合索引: `{user_openid: 1, class_id: 1}` (唯一索引)

---

## 3. `students` (学生基础信息)

存储所有学生的详细档案信息。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (学号, **业务主键, 需确保唯一**)
-   `name`: String (姓名)
-   `gender`: String ("男" / "女")
-   `class_name`: String (班级名称)
-   `group_id`: String (所属小组ID, 关联到student_groups)
-   `is_boarding`: Boolean (是否住宿生)
-   `position`: String (班干部职务, 如: 班长、学习委员、卫生委员等)
-   `student_status_id`: String (学籍信息ID, 关联到student_status)
-   `current_score`: Number (当前总积分)
-   `initial_score`: Number (学期初始分, 默认100)
-   `id_card_number`: String (身份证号, **加密存储**)
-   `date_of_birth`: Date (出生日期)
-   `phone_number`: String (个人手机号)
-   `parent_phone_number`: String (家长手机号)
-   `home_address`: String (家庭住址)
-   `ethnicity`: String (民族)
-   `native_place`: String (籍贯)
-   `political_status`: String (政治面貌)
-   `postal_code`: String (邮政编码)
-   `enrollment_date`: Date (入学日期)
-   `graduated_from`: String (毕业学校)
-   `health_status`: String (健康状况)
-   `height`: Number (身高, 单位cm, 用于座位安排)
-   `family_members`: Array (家庭主要成员)
    -   `relationship`: String (称谓)
    -   `name`: String (姓名)
    -   `age`: Number (年龄)
    -   `work_unit`: String (工作单位)
    -   `position`: String (职务)
    -   `phone_number`: String (联系电话)
-   `resume`: Array (个人简历)
    -   `period`: String (起止年月)
    -   `details`: String (在何地、何校、任何职)
    -   `reference`: String (证明人)
-   `awards_and_punishments`: String (奖惩情况)
-   `head_teacher_opinion`: String (班主任意见)
-   `school_opinion`: String (学校意见)
-   `score_level`: String (积分等级, 根据current_score动态计算)
-   `dorm_info`: Object (住宿信息, **仅住宿生拥有此字段**)
    -   `building`: String (楼栋)
    -   `room`: String (房间号)
    -   `bed`: Number (床位号)
-   `dorm_score`: Number (当前学期的住宿积分, 由dorm_score_records累加计算)
-   `dorm_initial_score`: Number (当前学期初始住宿积分, 默认100)
-   `dorm_converted_score`: Number (已折算到总积分的宿舍积分)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)
-   `created_by`: String (创建人openid)
-   `updated_by`: String (更新人openid)
-   `operation_history`: Array (操作历史记录)
    -   `operation`: String (操作类型)
    -   `operator`: String (操作人)
    -   `timestamp`: Date (操作时间)
    -   `details`: String (操作详情)

---

## 2. `student_status` (学籍信息表)

存储学生的学籍详细信息。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到students)
-   `student_type`: String (学生类型, 如: 普通生、三二分段等)
-   `major`: String (专业)
-   `grade`: String (年级)
-   `class`: String (班级)
-   `admission_date`: Date (入学日期)
-   `graduation_date`: Date (预计毕业日期)
-   `status`: String (学籍状态, 在读/休学/退学/毕业)
-   `transfer_school`: String (转学来源学校, 如适用)
-   `remarks`: String (备注)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

---

## 3. `dorm_score_accounts` (宿舍积分双重账本)

分别管理宿舍原始积分和折算积分。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到students)
-   `semester_id`: String (关联到semesters)
-   `original_score`: Number (宿舍原始积分, 初始100分)
-   `converted_score`: Number (已折算到总积分的积分)
-   `conversion_ratio`: Number (折算比例, 默认0.3)
-   `warning_count`: Number (预警次数)
-   `last_warning_type`: String (最后一次预警类型)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

---

## 4. `dorm_score_records` (住宿积分记录)

记录住宿积分的变动。

-   `_id`: String (自动生成的主键)
-   `record_id`: String (记录ID, **业务主键**)
-   `student_id`: String (关联到students)
-   `item_id`: String (关联到score_items)
-   `score_change`: Number (本次分数变化, 负数表示扣分)
-   `reason_detail`: String (具体事由)
-   `date`: Date (发生日期)
-   `recorder_name`: String (记录人)
-   `recorder_openid`: String (记录人openid)
-   `semester_id`: String (关联到semesters)
-   `building`: String (楼栋)
-   `room`: String (房间号)
-   `check_type`: String (检查类型, 如: 卫生检查、纪律检查、安全检查)
-   `proof_images`: Array (违规证明图片URL列表)
-   `proof_files`: Array (违规证明文件URL列表)
-   `is_converted`: Boolean (是否已折算)
-   `converted_record_id`: String (折算记录ID, 关联到score_records)
-   `created_at`: Date (创建时间)

---

## 5. `score_items` (积分项目表)

预定义所有加分和扣分的标准项目。

-   `_id`: String (自动生成的主键)
-   `item_id`: String (项目ID, **业务主键**)
-   `name`: String (项目名称)
-   `category`: String (所属大类, 如: 品德表现、住宿管理、考勤、竞赛获奖、志愿服务、学习表现等)
-   `default_score`: Number (默认分值, 正数或负数)
-   `type`: String ("加分" / "扣分")
-   `description`: String (项目描述)
-   `is_active`: Boolean (是否启用)
-   `requires_approval`: Boolean (是否需要审核)
-   `max_times_per_semester`: Number (每学期最多可记录次数, -1表示不限制)
-   `max_score_per_semester`: Number (每学期该项目最高累计分数, -1表示不限制)
-   `applicable_roles`: Array (适用角色, 如: ["班长", "学习委员"])
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

---

## 6. `score_records` (日常积分记录)

所有积分变动的流水总账。

-   `_id`: String (自动生成的主键)
-   `record_id`: String (记录ID, **业务主键**)
-   `student_id`: String (关联到students)
-   `item_id`: String (关联到score_items)
-   `score_change`: Number (本次实际的分数变化)
-   `reason_detail`: String (具体事由)
-   `date`: Date (发生日期)
-   `recorder_name`: String (记录人)
-   `recorder_openid`: String (记录人openid)
-   `semester_id`: String (关联到semesters)
-   `source_type`: String (来源类型, 如: 日常记录、志愿服务、竞赛获奖、证书获得、处分扣分、宿舍折算等)
-   `source_record_id`: String (原始记录ID)
-   `approval_status`: String ("待审核", "已通过", "已拒绝")
-   `approver_name`: String (审批人)
-   `approval_time`: Date (审批时间)
-   `approval_comment`: String (审批意见)
-   `created_at`: Date (创建时间)

---

## 7. `semesters` (学期信息)

管理学期,用于划分不同时间段的数据。

-   `_id`: String (自动生成的主键)
-   `name`: String (学期名称, 如: "2024-2025第一学期")
-   `start_date`: Date (学期开始日期)
-   `end_date`: Date (学期结束日期)
-   `status`: String (学期状态: "active" / "inactive", 只能有一个活跃学期)
-   `description`: String (学期描述信息)
-   `initial_score`: Number (学期初始积分, 默认100)
-   `dorm_initial_score`: Number (住宿积分初始值, 默认100)
-   `dorm_conversion_ratio`: Number (住宿积分折算比例, 默认0.3)
-   `dorm_warning_threshold`: Number (住宿预警阈值, 默认60)
-   `dorm_critical_threshold`: Number (住宿退宿阈值, 默认40)
-   `is_initialized`: Boolean (是否已初始化)
-   `previous_seating_chart_id`: String (上学期座位表ID)
-   `previous_group_id`: String (上学期分组ID)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

---

## 8. `users` (应用用户信息)

存储小程序的用户,用于权限控制和会员管理。

### 基础信息字段

-   `_id`: String (自动生成的主键)
-   `_openid`: String (用户在小程序下的唯一标识, **业务主键**)
-   `role`: String (角色, 如: 'admin', 'head_teacher', 'subject_teacher', 'class_cadre', 'student', 'parent')
-   `nickname`: String (微信昵称)
-   `avatarUrl`: String (微信头像地址)
-   `phone`: String (手机号, 可选)
-   `email`: String (邮箱, 可选)
-   `student_id`: String (关联到students, 如果用户是学生或家长)
-   `class_name`: String (负责的班级名称, 班主任和科任老师)
-   `subjects`: Array (负责的科目, 科任老师)
-   `class_cadre_type`: String (班干部类型, 如: 班长、学习委员、卫生委员等)
-   `class_cadre_permissions`: Array (班干部权限列表)
-   `assigned_classes`: Array (分配的班级列表, 科任老师)
-   `last_login`: Date (最后登录时间)

### 会员信息字段 ⭐ 新增

-   `membership`: Object (会员信息)
    -   `level`: String (会员等级: 'free'免费用户 / 'basic'基础版 / 'pro'专业版 / 'enterprise'企业版, **默认'free'**)
    -   `status`: String (会员状态: 'active'有效 / 'expired'已过期 / 'cancelled'已取消 / 'pending'待支付, **默认'active'**)
    -   `start_date`: Date (会员开始时间)
    -   `expire_date`: Date (会员到期时间, null表示永久有效)
    -   `auto_renew`: Boolean (是否自动续费, 默认false)
    -   `days_remaining`: Number (剩余天数, 由云函数定时更新)
    -   `plan_id`: String (订阅方案ID, 关联membership_plans集合)
    -   `plan_name`: String (订阅方案名称, 如: "年度专业版")
-   `membership_permissions`: Object (会员专属权限)
    -   `can_create_class`: Boolean (是否可创建班级, **免费用户false, 付费用户true**)
    -   `max_classes`: Number (可创建班级数量上限, 免费0, 基础版1, 专业版5, 企业版无限填-1)
    -   `max_students_per_class`: Number (每班最大学生数, 免费0, 基础版50, 专业版200, 企业版无限填-1)
    -   `can_authorize_admin`: Boolean (是否可授权班级管理员, 付费用户true)
    -   `can_export_data`: Boolean (是否可导出数据, 专业版及以上true)
    -   `can_use_advanced_analytics`: Boolean (是否可使用高级分析, 专业版及以上true)
    -   `can_use_ai_features`: Boolean (是否可使用AI功能, 企业版true)
    -   `storage_quota_mb`: Number (云存储配额MB, 免费100MB, 基础版500MB, 专业版2GB, 企业版10GB)
    -   `history_retention_days`: Number (历史数据保留天数, 免费30天, 基础版180天, 专业版365天, 企业版-1永久)
-   `membership_usage`: Object (会员使用情况统计)
    -   `classes_created`: Number (已创建班级数)
    -   `storage_used_mb`: Number (已使用存储空间MB)
    -   `last_usage_update`: Date (最后更新时间)

### 权限字段

-   `permissions`: Array (权限列表)
    -   `module`: String (模块名称)
    -   `actions`: Array (允许的操作, 如: ["read", "write", "delete", "approve"])
-   `is_active`: Boolean (是否激活)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)
-   `permission_change_history`: Array (权限变更历史)
    -   `change_type`: String (变更类型)
    -   `old_permissions`: Array (旧权限)
    -   `new_permissions`: Array (新权限)
    -   `operator`: String (操作人)
    -   `timestamp`: Date (操作时间)
    -   `reason`: String (变更原因)

### 会员订阅历史

-   `subscription_history`: Array (订阅历史记录)
    -   `order_id`: String (订单ID)
    -   `plan_id`: String (订阅方案ID)
    -   `plan_name`: String (方案名称)
    -   `level`: String (会员等级)
    -   `duration_days`: Number (订阅天数)
    -   `price`: Number (价格, 单位:分)
    -   `payment_method`: String (支付方式: 'wechat' / 'alipay')
    -   `transaction_id`: String (交易流水号)
    -   `status`: String (订单状态: 'pending'待支付 / 'paid'已支付 / 'refunded'已退款 / 'cancelled'已取消)
    -   `paid_at`: Date (支付时间)
    -   `start_date`: Date (生效开始时间)
    -   `expire_date`: Date (生效结束时间)
    -   `created_at`: Date (订单创建时间)

### 邀请相关

-   `invite_info`: Object (邀请信息)
    -   `invite_code`: String (专属邀请码)
    -   `invited_by`: String (被谁邀请, 邀请人openid)
    -   `invite_count`: Number (成功邀请人数)
    -   `invite_rewards`: Number (邀请奖励积分/天数)
    -   `invited_at`: Date (被邀请注册时间)

**索引建议:**
- `{_openid: 1}` (唯一索引, 主键查询)
- `{"membership.level": 1, "membership.status": 1}` (按会员等级和状态查询)
- `{"membership.expire_date": 1}` (查询即将过期的会员)
- `{invite_info_invite_code: 1}` (按邀请码查询, 如需设置唯一索引)

---

## 9. `redemption_items` (积分兑换物品)

管理可兑换的物品。

-   `_id`: String (自动生成的主键)
-   `item_id`: String (物品ID, **业务主键**)
-   `name`: String (物品名称)
-   `image_url`: String (物品图片URL)
-   `required_score`: Number (所需积分)
-   `redemption_mode`: String ("直接兑换" / "投标模式")
-   `quantity`: Number (物品数量)
-   `description`: String (物品描述)
-   `bid_start_time`: Date (投标开始时间, 投标模式)
-   `bid_end_time`: Date (投标截止时间, 投标模式)
-   `status`: String ("可兑换", "已兑换", "已取消")
-   `winner_id`: String (中标学生ID)
-   `winner_bid_score`: Number (中标积分)
- `created_by`: String (创建人openid)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

---

## 10. `redemption_requests` (积分兑换申请/投标记录)

记录兑换申请和投标记录。

-   `_id`: String (自动生成的主键)
-   `request_id`: String (请求ID, **业务主键**)
-   `item_id`: String (关联到redemption_items)
-   `student_id`: String (关联到students)
-   `redemption_mode`: String ("直接兑换" / "投标")
-   `bid_score`: Number (投标积分, 投标模式)
-   `bid_time`: Date (投标时间, 投标模式)
-   `status`: String ("待审批", "已批准", "已拒绝", "已取消", "已中标", "未中标")
-   `is_winner`: Boolean (是否中标)
-   `approval_comment`: String (审批意见)
-   `approver_name`: String (审批人)
-   `approval_time`: Date (审批时间)
-   `cancellation_time`: Date (取消时间)
-   `created_at`: Date (创建时间)

---

## 11. `volunteer_records` (志愿服务记录)

记录学生的志愿服务活动。

-   `_id`: String (自动生成的主键)
-   `record_id`: String (记录ID, **业务主键**)
-   `student_id`: String (关联到students)
-   `activity_name`: String (活动名称)
-   `organization`: String (组织单位)
-   `date`: Date (服务日期)
-   `duration`: Number (服务时长, 单位: 小时)
-   `earned_score`: Number (获得积分, 每小时2分)
-   `description`: String (服务内容简述)
-   `recorder_name`: String (记录人)
-   `recorder_openid`: String (记录人openid)
-   `semester_id`: String (关联到semesters)
-   `related_score_record_id`: String (关联积分记录ID)
-   `location`: String (服务地点)
-   `service_type`: String (服务类型, 如: 社区服务、环保活动、助老助残)
-   `proof_images`: Array (证明图片URL列表)
-   `proof_files`: Array (证明文件URL列表, 如签到表)
-   `is_verified`: Boolean (是否已验证)
-   `verifier_name`: String (验证人)
-   `verification_time`: Date (验证时间)
-   `created_at`: Date (创建时间)

---

## 12. `discipline_records` (处分记录)

记录对学生的正式处分。

-   `_id`: String (自动生成的主键)
-   `record_id`: String (记录ID, **业务主键**)
-   `student_id`: String (关联到students)
-   `discipline_level`: String (处分级别, 如: 警告、严重警告、记过、记大过、留校察看、开除学籍)
-   `reason`: String (处分原因)
-   `document_id`: String (处分文件编号)
-   `score_deduction`: Number (对应扣分)
-   `issue_date`: Date (处分下达日期)
-   `issuer`: String (发布单位/人)
-   `is_revoked`: Boolean (是否已撤销)
-   `revocation_date`: Date (撤销日期)
-   `revocation_reason`: String (撤销原因)
-   `effective_period`: Number (处分有效期, 单位: 月)
-   `expiration_date`: Date (处分到期日期)
-   `affects_excellence_award`: Boolean (是否限制评优)
-   `semester_id`: String (关联到semesters)
-   `related_score_record_id`: String (关联积分记录ID)
-   `created_at`: Date (创建时间)

---

## 13. `revocation_applications` (撤销申请)

管理处分撤销申请流程。

-   `_id`: String (自动生成的主键)
-   `application_id`: String (申请ID, **业务主键**)
-   `discipline_record_id`: String (关联到discipline_records)
-   `student_id`: String (关联到students)
-   `application_date`: Date (申请日期)
-   `application_reason`: String (申请撤销理由)
-   `supporting_materials`: Array (支撑材料URL列表)
-   `status`: String ("待审核", "已批准", "已拒绝")
-   `reviewer_name`: String (审核人)
-   `review_date`: Date (审核日期)
-   `review_comments`: String (审核意见)
-   `semester_id`: String (关联到semesters)
-   `teacher_recommendation`: String (班主任推荐意见)
-   `student_self_reflection`: String (学生自我反思)
-   `created_at`: Date (创建时间)

---

## 14. `skill_certificates` (技能证书管理)

记录学生获得的各类技能证书。

-   `_id`: String (自动生成的主键)
-   `certificate_id`: String (证书ID, **业务主键**)
-   `student_id`: String (关联到students)
-   `certificate_name`: String (证书名称)
-   `certificate_level`: String (证书级别, 如: 初级、中级、高级)
-   `issuing_authority`: String (颁发机构)
-   `certificate_number`: String (证书编号)
-   `issue_date`: Date (颁发日期)
-   `validity_period`: String (有效期)
-   `certificate_image_url`: String (证书图片URL)
-   `certificate_file_url`: String (证书文件URL)
-   `earned_score`: Number (获得积分)
-   `is_competition_related`: Boolean (是否与竞赛相关)
-   `competition_id`: String (关联竞赛ID)
-   `credit_value`: Number (学分换算值)
-   `related_score_record_id`: String (关联积分记录ID)
-   `semester_id`: String (关联到semesters)
-   `created_at`: Date (创建时间)

---

## 15. `grade_records` (成绩记录)

记录学生的考试成绩。

-   `_id`: String (自动生成的主键)
-   `record_id`: String (记录ID, **业务主键**)
-   `student_id`: String (关联到students)
-   `semester_id`: String (关联到semesters)
-   `subject`: String (科目名称)
-   `exam_name`: String (考试名称)
-   `exam_date`: Date (考试日期)
-   `score`: Number (分数)
-   `is_passing`: Boolean (是否及格)
-   `credit`: Number (学分)
-   `gpa`: Number (GPA)
-   `is_transfer_exam`: Boolean (是否转段考)
-   `requires_certificate`: Boolean (是否要求技能证书)
-   `required_certificate_id`: String (所需证书ID)
-   `has_certificate`: Boolean (是否已获得证书)
-   `recorder_name`: String (记录人)
-   `recorder_openid`: String (记录人openid)
-   `created_at`: Date (创建时间)

---

## 16. `student_groups` (学生分组)

管理学生分组信息，支持多种分组类型（学习小组、值日小组、宿舍小组等）。

-   `_id`: String (自动生成的主键)
-   `group_id`: String (分组ID, **业务主键**, 可选，自动生成)
-   `group_name`: String (分组名称, **必填**)
-   `group_type`: String (分组类型: 学习小组/值日小组/宿舍小组/兴趣小组/项目小组/其他, **必填**)
-   `group_color`: String (分组颜色, 十六进制颜色值, 如: #1890ff)
-   `class_id`: String (所属班级ID, **必填**, 用于数据隔离)
-   `description`: String (分组描述)
-   `leader_id`: String (组长学生ID)
-   `members`: Array (组员列表)
    -   `student_id`: String (学生ID)
    -   `student_name`: String (学生姓名)
    -   `role`: String (角色: 组长/组员, 默认组员)
    -   `joined_at`: Date (加入日期)
-   `semester_id`: String (关联学期ID, 可选)
-   `version`: Number (分组版本号, 默认1)
-   `is_active`: Boolean (是否激活, 默认true)
-   `is_deleted`: Boolean (是否已删除, 软删除标记)
-   `deleted_at`: Date (删除时间)
-   `creator_openid`: String (创建人openid)
-   `creator_name`: String (创建人姓名)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

**索引建议:**
- `{class_id: 1, group_type: 1}` (按班级和类型查询)
- `{class_id: 1, is_deleted: 1}` (按班级查询未删除分组)
- `{creator_openid: 1}` (按创建人查询)

---

## 17. `duty_schedule` (卫生值日表)

管理卫生值日安排。

-   `_id`: String (自动生成的主键)
-   `schedule_id`: String (值日表ID, **业务主键**)
-   `semester_id`: String (关联到semesters)
-   `week_number`: Number (周数)
-   `start_date`: Date (开始日期)
-   `end_date`: Date (结束日期)
-   `tasks`: Array (值日任务列表)
    -   `task_id`: String (任务ID)
    -   `task_type`: String (任务类型, 如: 扫地、擦黑板、倒垃圾)
    -   `group_id`: String (负责小组ID)
    -   `student_id`: String (负责学生ID)
    -   `task_date`: Date (任务日期)
    -   `status`: String ("待完成", "已完成", "未完成")
    -   `completion_time`: Date (完成时间)
    -   `inspection_score`: Number (检查评分, 1-5分)
    -   `inspector_name`: String (检查人)
    -   `problems`: String (问题记录)
    -   `problem_images`: Array (问题图片URL列表)
    -   `mentioned_users`: Array (@相关人员)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

---

## 18. `duty_reminders` (值日提醒记录)

记录值日提醒的发送情况。

-   `_id`: String (自动生成的主键)
-   `schedule_id`: String (关联到duty_schedule)
-   `task_id`: String (任务ID)
-   `student_id`: String (学生ID)
-   `leader_id`: String (组长ID)
-   `reminder_type`: String (提醒类型, 如: 任务提醒、未完成提醒、预警通知)
-   `reminder_time`: Date (提醒时间)
-   `reminder_status`: String ("已发送", "发送失败")
-   `consecutive_days`: Number (连续未完成天数)
-   `created_at`: Date (创建时间)

---

## 19. `seating_charts` (教室座位表)

管理教室座位安排。

-   `_id`: String (自动生成的主键)
-   `chart_id`: String (座位表ID, **业务主键**)
-   `semester_id`: String (关联到semesters)
-   `rows`: Number (行数, 默认6行A-F)
-   `columns`: Number (列数, 默认8列1-8)
-   `seats`: Array (座位列表)
    -   `seat_id`: String (座位ID, 如: A1, B3)
    -   `row`: String (行号)
    -   `column`: Number (列号)
    -   `student_id`: String (学生ID, 可为空)
    -   `student_name`: String (学生姓名)
    -   `student_height`: Number (学生身高)
-   `version`: Number (版本号)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)
-   `change_history`: Array (调整历史)
    -   `change_type`: String (变更类型)
    -   `seat_id`: String (座位ID)
    -   `old_student_id`: String (原学生ID)
    -   `new_student_id`: String (新学生ID)
    -   `operator`: String (操作人)
    -   `timestamp`: Date (操作时间)

---

## 20. `ai_reviews` (AI点评记录)

存储AI生成的学生点评。

-   `_id`: String (自动生成的主键)
-   `review_id`: String (点评ID, **业务主键**)
-   `student_id`: String (关联到students)
-   `review_type`: String ("按月", "按学期", "按学年")
-   `review_period`: String (点评周期, 如: "2024年12月", "2024-2025第一学期")
-   `review_content`: String (点评内容)
-   `score_summary`: Object (积分汇总)
    -   `total_score`: Number (总积分)
    -   `score_change`: Number (积分变化)
    -   `score_trend`: String (积分趋势)
-   `activity_summary`: Object (活动汇总)
    -   `volunteer_hours`: Number (志愿时长)
    -   `competition_count`: Number (竞赛次数)
    -   `certificate_count`: Number (证书数量)
-   `discipline_summary`: Object (违纪汇总)
    -   `discipline_count`: Number (处分次数)
    -   `discipline_levels`: Array (处分级别列表)
-   `suggestions`: Array (改进建议列表)
-   `is_edited`: Boolean (是否已编辑)
-   `edited_content`: String (编辑后的内容)
-   `is_confirmed`: Boolean (是否已确认)
-   `confirmed_by`: String (确认人)
-   `confirmed_time`: Date (确认时间)
-   `is_shared`: Boolean (是否已分享)
-   `shared_to`: Array (分享对象, 如: ["student", "parent"])
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

---

## 21. `birthday_wishes` (生日祝福记录)

记录生日祝福的发送情况。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到students)
-   `birthday`: Date (生日)
-   `wish_content`: String (祝福内容)
-   `sent_to_student`: Boolean (是否已发送给学生)
-   `sent_to_parent`: Boolean (是否已发送给家长)
-   `is_holiday`: Boolean (是否在节假日)
-   `sent_date`: Date (发送日期)
-   `created_at`: Date (创建时间)

---

## 22. `weather_reminders` (天气提醒记录)

记录天气提醒的发送情况。

-   `_id`: String (自动生成的主键)
-   `reminder_date`: Date (提醒日期)
-   `weather_condition`: String (天气状况)
-   `temperature`: Object (温度信息)
    -   `min`: Number (最低温度)
    -   `max`: Number (最高温度)
-   `is_severe`: Boolean (是否恶劣天气)
-   `reminder_content`: String (提醒内容)
-   `clothing_suggestion`: String (穿衣建议)
-   `travel_tips`: String (出行建议)
-   `sent_time`: Date (发送时间)
-   `sent_count`: Number (发送人数)
-   `created_at`: Date (创建时间)

---

## 23. `system_files` (制度文件管理)

管理制度性文件。

-   `_id`: String (自动生成的主键)
-   `file_id`: String (文件ID, **业务主键**)
-   `title`: String (文件标题)
-   `file_type`: String (文件类型, 如: PDF, Word, Image)
-   `file_url`: String (文件URL)
-   `file_size`: Number (文件大小, 单位: bytes)
-   `category`: String (文件分类)
-   `description`: String (文件简介)
-   `is_pinned`: Boolean (是否置顶)
-   `permissions`: String ("公开", "仅学生可见", "仅家长可见")
-   `valid_until`: Date (有效期截止日期)
-   `is_archived`: Boolean (是否已归档)
-   `version`: Number (版本号)
-   `created_by`: String (创建人openid)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

---

## 24. `file_views` (文件查看记录)

记录文件的查看和下载情况。

-   `_id`: String (自动生成的主键)
-   `file_id`: String (关联到system_files)
-   `viewer_id`: String (查看人openid)
-   `viewer_role`: String (查看人角色)
-   `view_time`: Date (查看时间)
-   `download_time`: Date (下载时间)
-   `created_at`: Date (创建时间)

---

## 25. `file_notifications` (文件推送记录)

记录文件的推送情况。

-   `_id`: String (自动生成的主键)
-   `file_id`: String (关联到system_files)
-   `notification_type`: String (通知类型)
-   `recipients`: Array (接收人列表)
    -   `recipient_id`: String (接收人ID)
    -   `recipient_type`: String (接收人类型, student/parent)
-   `sent_time`: Date (发送时间)
-   `created_at`: Date (创建时间)

---

## 26. `transfer_exam_monitoring` (转段考监控)

监控转段考成绩和证书要求。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到students)
-   `subject`: String (科目名称)
-   `exam_date`: Date (考试日期)
-   `score`: Number (分数)
-   `is_passing`: Boolean (是否及格)
-   `requires_certificate`: Boolean (是否要求证书)
-   `required_certificate_id`: String (所需证书ID)
-   `has_certificate`: Boolean (是否已获得证书)
-   `certificate_obtained_date`: Date (证书获得日期)
-   `student_notified`: Boolean (是否已通知学生)
-   `parent_notified`: Boolean (是否已通知家长)
-   `teacher_notified`: Boolean (是否已通知班主任)
-   `notification_time`: Date (通知时间)
-   `created_at`: Date (创建时间)

---

## 27. `automated_workflows` (自动化工作流配置)

配置自动化工作流规则。

-   `_id`: String (自动生成的主键)
-   `workflow_name`: String (工作流名称)
-   `trigger_type`: String (触发类型, 如: 积分阈值、时间触发、状态变更)
-   `trigger_condition`: Object (触发条件)
    -   `field`: String (字段名)
    -   `operator`: String (操作符, 如: >, <, =)
    -   `value`: Any (目标值)
-   `action_type`: String (动作类型, 如: 发送通知、发送消息、更新数据、创建记录)
-   `action_config`: Object (动作配置)
    -   `template_id`: String (模板ID)
    -   `recipients`: Array (接收人列表)
    -   `data`: Object (数据)
-   `is_active`: Boolean (是否激活)
-   `execution_count`: Number (执行次数)
-   `last_execution_time`: Date (最后执行时间)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

---

## 28. `workflow_executions` (工作流执行记录)

记录工作流的执行情况。

-   `_id`: String (自动生成的主键)
-   `workflow_id`: String (关联到automated_workflows)
-   `trigger_data`: Object (触发数据)
-   `execution_time`: Date (执行时间)
-   `execution_status`: String ("成功", "失败")
-   `result`: Object (执行结果)
-   `error_message`: String (错误信息)
-   `created_at`: Date (创建时间)

---

## 29. `audit_logs` (审计日志)

记录所有关键操作的审计日志。

-   `_id`: String (自动生成的主键)
-   `log_id`: String (日志ID, **业务主键**)
-   `user_id`: String (用户openid)
-   `user_role`: String (用户角色)
-   `action`: String (操作类型)
-   `module`: String (操作模块)
-   `target_id`: String (目标对象ID)
-   `target_type`: String (目标对象类型)
-   `old_value`: Object (旧值)
-   `new_value`: Object (新值)
-   `ip_address`: String (IP地址)
-   `user_agent`: String (用户代理)
-   `created_at`: Date (创建时间)

---

## 30. `data_archives` (数据归档)

存储已过期的归档数据。

-   `_id`: String (自动生成的主键)
-   `archive_id`: String (归档ID, **业务主键**)
-   `original_collection`: String (原始集合名称)
-   `original_id`: String (原始记录ID)
-   `data`: Object (完整数据)
-   `archive_reason`: String (归档原因)
-   `archive_date`: Date (归档日期)
-   `retention_period`: Number (保留期限, 单位: 天)
-   `expiration_date`: Date (过期日期)
-   `created_at`: Date (创建时间)

---

## 31. `class_schedules` (班级课程表)

管理班级的课程安排。

-   `_id`: String (自动生成的主键)
-   `schedule_id`: String (课程表ID, **业务主键**)
-   `class_id`: String (所属班级ID, **必填**)
-   `semester_id`: String (关联学期ID)
-   `weekday`: String (星期: 一/二/三/四/五/六/日)
-   `period`: Number (节次: 1-8)
-   `course_name`: String (课程名称)
-   `subject`: String (科目)
-   `teacher_id`: String (教师ID, 关联users)
-   `teacher_name`: String (教师姓名)
-   `teacher_openid`: String (教师openid)
-   `classroom`: String (教室)
-   `start_time`: String (开始时间, 如: "08:00")
-   `end_time`: String (结束时间, 如: "08:45")
-   `week_type`: String (单双周: 'all'每周 / 'odd'单周 / 'even'双周, 默认'all')
-   `status`: String (状态: 'active'有效 / 'cancelled'取消)
-   `remark`: String (备注)
-   `created_by`: String (创建人openid)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

**索引建议:**
- `{class_id: 1, weekday: 1, period: 1}` (按班级查询课表)
- `{teacher_openid: 1, weekday: 1}` (按教师查询课程)
- `{semester_id: 1, class_id: 1}` (按学期查询)

---

## 32. `membership_plans` (会员订阅方案)

定义不同的会员订阅方案和权益。

-   `_id`: String (自动生成的主键)
-   `plan_id`: String (方案ID, **业务主键**, 如: "basic_yearly", "pro_monthly")
-   `plan_name`: String (方案名称, 如: "年度基础版", "月度专业版")
-   `level`: String (会员等级: 'free' / 'basic' / 'pro' / 'enterprise')
-   `duration_days`: Number (有效期天数, -1表示永久)
-   `price`: Number (价格, 单位: 分)
-   `original_price`: Number (原价, 单位: 分, 用于显示折扣)
-   `discount_rate`: Number (折扣率, 如: 0.8 表示8折)
-   `features`: Array (方案特性列表, 用于前端展示)
    -   `icon`: String (图标)
    -   `text`: String (特性描述)
-   `permissions`: Object (包含的权限)
    -   `can_create_class`: Boolean
    -   `max_classes`: Number
    -   `max_students_per_class`: Number
    -   `can_authorize_admin`: Boolean
    -   `can_export_data`: Boolean
    -   `can_use_advanced_analytics`: Boolean
    -   `can_use_ai_features`: Boolean
    -   `storage_quota_mb`: Number
    -   `history_retention_days`: Number
-   `is_recommended`: Boolean (是否推荐方案)
-   `is_active`: Boolean (是否上架)
-   `sort_order`: Number (排序权重)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

**预设方案示例:**

| 等级 | 方案 | 价格 | 创建班级 | 最大学生数 | 存储空间 |
|------|------|------|----------|-----------|----------|
| free | 免费用户 | ¥0 | ❌ | 0 | 100MB |
| basic | 基础版 | ¥99/年 | ✅ 1个 | 50人 | 500MB |
| pro | 专业版 | ¥299/年 | ✅ 5个 | 200人 | 2GB |
| enterprise | 企业版 | ¥999/年 | ✅ 无限 | 无限 | 10GB |

---

## 32. `membership_orders` (会员订单)

记录会员购买订单。

-   `_id`: String (自动生成的主键)
-   `order_id`: String (订单号, **业务主键**, 如: "MO202603190001")
-   `user_openid`: String (用户openid)
-   `plan_id`: String (订阅方案ID)
-   `plan_name`: String (方案名称快照)
-   `level`: String (会员等级)
-   `duration_days`: Number (订阅天数)
-   `amount`: Number (订单金额, 单位: 分)
-   `discount_amount`: Number (优惠金额, 单位: 分)
-   `final_amount`: Number (实付金额, 单位: 分)
-   `payment_method`: String (支付方式: 'wechat'微信支付 / 'alipay'支付宝 / 'invite_reward'邀请奖励)
-   `transaction_id`: String (第三方交易流水号)
-   `status`: String (订单状态: 'pending'待支付 / 'paid'已支付 / 'refunded'已退款 / 'cancelled'已取消 / 'expired'已过期)
-   `paid_at`: Date (支付时间)
-   `refunded_at`: Date (退款时间)
-   `refund_reason`: String (退款原因)
-   `membership_start`: Date (会员生效开始时间)
-   `membership_end`: Date (会员生效结束时间)
-   `invite_code_used`: String (使用的邀请码)
-   `invite_discount`: Number (邀请优惠金额)
-   `created_at`: Date (订单创建时间)
-   `updated_at`: Date (订单更新时间)

**索引建议:**
- `{order_id: 1}` (唯一索引)
- `{user_openid: 1, status: 1}` (按用户查询订单)
- `{created_at: -1}` (按时间查询)
- `{status: 1, created_at: -1}` (查询待支付订单)

---

## 33. `feature_access_logs` (功能访问日志)

记录用户对付费功能的访问情况,用于统计分析和权限验证。

-   `_id`: String (自动生成的主键)
-   `log_id`: String (日志ID)
-   `user_openid`: String (用户openid)
-   `feature_code`: String (功能代码, 如: 'create_class', 'export_data', 'ai_analysis')
-   `feature_name`: String (功能名称)
-   `access_time`: Date (访问时间)
-   `access_result`: String (访问结果: 'allowed'允许 / 'denied_permission'权限不足 / 'denied_expired'会员过期 / 'denied_quota'超出配额)
-   `deny_reason`: String (拒绝原因详情)
-   `quota_used`: Number (使用的配额量)
-   `ip_address`: String (访问IP)
-   `device_info`: String (设备信息)
-   `created_at`: Date (创建时间)

---

## 35. `product_wishes` (商品心愿单)

学生提交的想要兑换的商品建议。

-   `_id`: String (自动生成的主键)
-   `wish_id`: String (心愿ID, **业务主键**)
-   `name`: String (商品名称, **必填**)
-   `description`: String (商品描述)
-   `expected_score`: Number (期望兑换积分, **必填**)
-   `student_id`: String (提交学生ID)
-   `student_name`: String (提交学生姓名)
-   `class_id`: String (所属班级ID, **必填**)
-   `status`: String (状态: 'pending'待处理 / 'added'已上架 / 'rejected'已拒绝, **默认'pending'**)
-   `vote_count`: Number (投票数, 默认0)
-   `voters`: Array (投票人学生ID列表)
-   `admin_reply`: String (管理员回复)
-   `added_item_id`: String (上架后的商品ID, 关联redemption_items)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

**索引建议:**
- `{class_id: 1, status: 1}` (按班级查询待处理心愿)
- `{class_id: 1, vote_count: -1}` (按班级查询热门心愿)
- `{student_id: 1}` (按学生查询提交的心愿)

**业务逻辑:**
1. 学生提交心愿商品，包含名称、描述、期望积分
2. 其他学生可以为心愿投票（每人每心愿限投一票）
3. 管理员/班主任可以查看心愿列表，根据投票数决定是否上架
4. 上架后状态变为 'added'，关联到新创建的 redemption_items 记录

---

## 36. `class_settings` (班级设置)

存储班级的各项配置参数，包括积分规则、功能开关等。

-   `_id`: String (自动生成的主键)
-   `class_id`: String (关联班级ID, **业务主键**)
-   `volunteer_score_per_hour`: Number (志愿服务每小时积分, 默认2)
-   `score_rules`: Object (积分规则配置)
    -   `max_score_per_day`: Number (每日积分上限, -1表示无限制)
    -   `min_score_per_action`: Number (单次积分最小值)
    -   `score_expire_days`: Number (积分有效期天数, -1表示永久)
-   `feature_flags`: Object (功能开关)
    -   `enable_volunteer`: Boolean (是否启用志愿服务, 默认true)
    -   `enable_dorm`: Boolean (是否启用宿舍管理, 默认false)
    -   `enable_competition`: Boolean (是否启用竞赛管理, 默认false)
    -   `enable_duty`: Boolean (是否启用值日管理, 默认true)
-   `notification_settings`: Object (通知设置)
    -   `remind_before_days`: Number (提前几天提醒, 默认1)
    -   `notify_on_birthday`: Boolean (生日提醒, 默认true)
    -   `notify_on_schedule`: Boolean (课程提醒, 默认true)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

**索引建议:**
- `{class_id: 1}` (唯一索引, 保证每个班级只有一条设置记录)

---

## 37. `score_categories` (积分类别元数据表)

存储积分的类别定义，支持动态配置和管理。

-   `_id`: String (自动生成的主键)
-   `category_id`: String (类别ID, **业务主键**)
-   `category_name`: String (类别名称, 如: "学习", "纪律", "卫生", "活动", "志愿服务")
-   `category_code`: String (类别代码, 用于程序引用)
-   `icon`: String (图标名称或emoji)
-   `color`: String (主题颜色, 十六进制)
-   `description`: String (类别描述)
-   `applicable_roles`: Array (适用对象, 如: ["student", "parent"])
-   `applicable_grades`: Array (适用年级, 空表示全部)
-   `sort_order`: Number (排序权重)
-   `is_system`: Boolean (是否系统内置, 不可删除)
-   `is_active`: Boolean (是否启用)
-   `class_id`: String (所属班级ID, 空表示全局模板)
-   `semester_id`: String (所属学期ID, 空表示长期有效)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

**索引建议:**
- `{category_id: 1}` (唯一索引)
- `{class_id: 1, semester_id: 1}` (复合索引)
- `{is_active: 1}`

---

## 38. `score_appeals` (积分申诉表)

存储学生对积分变动的申诉记录。

-   `_id`: String (自动生成的主键)
-   `appeal_id`: String (申诉ID, **业务主键**)
-   `record_id`: String (关联的积分记录ID)
-   `student_id`: String (申诉学生学号)
-   `student_name`: String (申诉学生姓名)
-   `class_id`: String (所属班级ID)
-   `appeal_type`: String (申诉类型: "score_error" / "rule_dispute" / "other")
-   `appeal_reason`: String (申诉理由)
-   `original_score`: Number (原积分值)
-   `requested_score`: Number (期望积分值)
-   `evidence_urls`: Array (证据图片URL列表)
-   `status`: String (状态: "pending" / "first_review" / "final_review" / "approved" / "rejected" / "withdrawn")
-   `first_reviewer`: String (初审人, 班委)
-   `first_review_time`: Date (初审时间)
-   `first_review_comment`: String (初审意见)
-   `first_review_result`: String (初审结果: "pass" / "reject" / "forward")
-   `final_reviewer`: String (终审人, 班主任)
-   `final_review_time`: Date (终审时间)
-   `final_review_comment`: String (终审意见)
-   `final_result`: String (终审结果: "approved" / "rejected" / "partial")
-   `adjusted_score`: Number (调整后积分, 如有)
-   `notify_parent`: Boolean (是否已通知家长)
-   `parent_notified_at`: Date (家长通知时间)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)
-   `deadline`: Date (处理截止时间, 48小时)

**索引建议:**
- `{appeal_id: 1}` (唯一索引)
- `{student_id: 1, status: 1}`
- `{class_id: 1, status: 1}`
- `{status: 1, deadline: 1}` (超时查询)

---

## 39. `score_rule_versions` (积分规则版本表)

存储积分规则的版本历史，支持版本管理和回滚。

-   `_id`: String (自动生成的主键)
-   `version_id`: String (版本ID, **业务主键**)
-   `rule_id`: String (关联的规则ID)
-   `version_number`: String (版本号, 如: "1.0.0")
-   `rule_name`: String (规则名称)
-   `rule_code`: String (规则代码)
-   `score_value`: Number (积分值)
-   `category_id`: String (所属类别ID)
-   `description`: String (规则描述)
-   `conditions`: Object (触发条件)
    -   `min_value`: Number (最小值条件)
    -   `max_value`: Number (最大值条件)
    -   `bonus_rules`: Array (奖励规则, 如"满5小时额外+10分")
-   `change_description`: String (变更说明)
-   `changed_fields`: Array (变更字段列表)
-   `previous_version`: String (前一版本ID)
-   `is_stable`: Boolean (是否稳定版本)
-   `is_active`: Boolean (是否当前活跃版本)
-   `class_id`: String (所属班级ID)
-   `semester_id`: String (所属学期ID)
-   `created_by`: String (创建人)
-   `created_by_name`: String (创建人姓名)
-   `created_at`: Date (创建时间)
-   `activated_at`: Date (激活时间)
-   `deprecated_at`: Date (废弃时间)

**索引建议:**
- `{version_id: 1}` (唯一索引)
- `{rule_id: 1, version_number: 1}`
- `{class_id: 1, semester_id: 1, is_active: 1}`

---

## 40. `score_reset_logs` (积分清零日志表)

记录积分清零操作的详细日志。

-   `_id`: String (自动生成的主键)
-   `reset_id`: String (清零操作ID, **业务主键**)
-   `class_id`: String (所属班级ID)
-   `semester_id`: String (目标学期ID)
-   `reset_type`: String (清零类型: "semester_start" / "year_start" / "manual" / "none")
-   `reset_scope`: String (清零范围: "all" / "partial" / "archive")
-   `reset_rules`: Object (清零规则)
    -   `keep_min_score`: Number (保留最低积分)
    -   `reset_base_only`: Boolean (仅清零基础分)
    -   `carry_over_ratio`: Number (结转比例, 0-1)
-   `affected_count`: Number (影响学生数量)
-   `total_score_reset`: Number (重置积分总量)
-   `backup_collection`: String (备份数据集合名)
-   `operator_id`: String (操作人ID)
-   `operator_name`: String (操作人姓名)
-   `operator_role`: String (操作人角色)
-   `device_fingerprint`: String (设备指纹)
-   `executed_at`: Date (执行时间)
-   `execution_duration`: Number (执行耗时, 毫秒)
-   `status`: String (状态: "success" / "partial" / "failed")
-   `error_message`: String (错误信息, 如有)
-   `created_at`: Date (创建时间)

**索引建议:**
- `{reset_id: 1}` (唯一索引)
- `{class_id: 1, semester_id: 1}`
- `{reset_type: 1, executed_at: 1}`

---

## 41. `score_anomaly_alerts` (异常积分预警表)

记录异常积分变动的预警信息。

-   `_id`: String (自动生成的主键)
-   `alert_id`: String (预警ID, **业务主键**)
-   `record_id`: String (关联的积分记录ID)
-   `student_id`: String (学生学号)
-   `student_name`: String (学生姓名)
-   `class_id`: String (所属班级ID)
-   `anomaly_type`: String (异常类型: "high_score" / "high_frequency" / "suspicious_pattern" / "rule_conflict")
-   `anomaly_details`: Object (异常详情)
    -   `score_value`: Number (积分值)
    -   `threshold`: Number (阈值)
    -   `frequency`: Number (24小时内操作次数)
    -   `pattern_description`: String (模式描述)
-   `severity`: String (严重程度: "low" / "medium" / "high" / "critical")
-   `status`: String (状态: "pending" / "confirmed" / "false_positive" / "resolved")
-   `reviewer`: String (审核人)
-   `review_time`: Date (审核时间)
-   `review_comment`: String (审核意见)
-   `action_taken`: String (采取的措施)
-   `related_audit_log`: String (关联的审核日志ID)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)

**索引建议:**
- `{alert_id: 1}` (唯一索引)
- `{student_id: 1, status: 1}`
- `{class_id: 1, anomaly_type: 1, status: 1}`
- `{severity: 1, status: 1}`

---

## 42. `score_operation_logs` (积分操作审计日志表)

记录所有积分操作的详细审计日志。

-   `_id`: String (自动生成的主键)
-   `log_id`: String (日志ID, **业务主键**)
-   `operation_type`: String (操作类型: "add" / "deduct" / "adjust" / "reset" / "appeal" / "export")
-   `record_id`: String (关联记录ID, 如有)
-   `student_id`: String (学生学号)
-   `student_name`: String (学生姓名)
-   `class_id`: String (所属班级ID)
-   `score_before`: Number (操作前积分)
-   `score_after`: Number (操作后积分)
-   `score_change`: Number (积分变化)
-   `rule_id`: String (使用的规则ID)
-   `rule_snapshot`: Object (规则快照, 含版本号)
-   `operator_id`: String (操作人ID)
-   `operator_name`: String (操作人姓名)
-   `operator_role`: String (操作人角色)
-   `device_fingerprint`: String (设备指纹)
-   `ip_address`: String (IP地址)
-   `user_agent`: String (用户代理)
-   `request_id`: String (请求ID, 用于追踪)
-   `created_at`: Date (创建时间)

**索引建议:**
- `{log_id: 1}` (唯一索引)
- `{student_id: 1, created_at: -1}`
- `{class_id: 1, created_at: -1}`
- `{operator_id: 1, created_at: -1}`

---

## 索引建议

为提高查询性能,建议为以下字段创建索引:

### classes
- `class_id` (唯一索引)
- `class_code` (唯一索引)
- `creator_id`
- `status`

### user_class_relation
- `user_openid`
- `class_id`
- `status`
- `{user_openid: 1, class_id: 1}` (复合唯一索引)

### students
- `student_id` (唯一索引)
- `class_id` 或 `class_name`
- `group_id`
- `current_score`

### score_records
- `student_id`
- `class_id`
- `semester_id`
- `date`
- `item_id`

### users
- `_openid` (唯一索引)
- `role`
- `student_id`
- `class_id` 或 `class_name`

### redemption_requests
- `item_id`
- `student_id`
- `bid_time`

### 其他集合
- 所有collection的 `created_at` 字段
- 所有外键关联字段

---

**版本**: 2.1  
**最后更新**: 2026-03-18  
**基于需求文档**: 25个详细需求  
**更新内容**: 新增 classes 和 user_class_relation 集合，优化登录流程和数据隔离机制
