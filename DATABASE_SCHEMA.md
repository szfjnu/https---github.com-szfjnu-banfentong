# 班级德育管理系统 - 数据库设计文档

本文档定义了班级德育管理小程序所需的所有云数据库集合（表）的结构和字段。

---

## 1. `students` (学生信息)

存储所有学生的详细档案信息。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (学号, **业务主键, 需确保唯一**)
-   `name`: String (姓名)
-   `gender`: String ("男" / "女")
-   `class_name`: String (班级名称)
-   `id_card_number`: String (身份证号)
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
-   `score`: Number (总德育分, 由 `score_records` 累加计算)
-   `score_level`: String (积分等级, 根据 `score` 动态计算)
-   `dorm_info`: Object (住宿信息, **仅住宿生拥有此字段**)
    -   `building`: String (楼栋)
    -   `room`: String (房间号)
    -   `bed`: Number (床位号)
-   `dorm_score`: Number (当前学期的住宿积分, 由 `score_records` 中宿舍类目累加计算)
-   `initial_dorm_score`: Number (当前学期初始住宿积分，默认100分)
-   `remaining_dorm_score`: Number (当前学期剩余住宿积分，初始分减去扣分)

---

## 2. `dorms` (宿舍信息)

定义学校的宿舍资源。

-   `_id`: String (自动生成的主键)
-   `building`: String (楼栋)
-   `room`: String (房间号)
-   `capacity`: Number (容量)
-   `gender_type`: String ("男" / "女", 限制入住性别)
-   `floor`: Number (楼层)
-   `room_type`: String (房间类型，例如："4人间"，"6人间")
-   `status`: String ("可用"，"维修中"，"已满")

---

## 3. `semesters` (学期信息)

管理学期，用于划分不同时间段的数据。

-   `_id`: String (自动生成的主键)
-   `name`: String (学期名称, 例如: "2024-2025第一学期")
-   `start_date`: Date (学期开始日期)
-   `end_date`: Date (学期结束日期)
-   `status`: String (学期状态: "active" / "inactive", 只能有一个活跃学期)
-   `description`: String (学期描述信息, 可选)
-   `created_at`: Date (创建时间)
-   `updated_at`: Date (更新时间)
-   `initial_dorm_score`: Number (住宿积分初始值，默认100分)
-   `dorm_warning_threshold`: Number (住宿预警阈值，例如：60分)
-   `dorm_critical_threshold`: Number (住宿退宿阈值，例如：40分)

---

## 4. `score_items` (德育积分项目)

预定义所有加分和扣分的标准项目。

-   `_id`: String (自动生成的主键)
-   `item_id`: String (项目ID, **业务主键, 需确保唯一**)
-   `name`: String (项目名称, 例如: "拾金不昧")
-   `category`: String (所属大类, 例如: "品德表现", "住宿管理", "考勤", "竞赛获奖", "志愿服务")
-   `default_score`: Number (默认分值, 正数或负数)
-   `type`: String ("加分" / "扣分")
-   `description`: String (项目描述，可选)
-   `is_active`: Boolean (是否启用)
-   `max_times_per_semester`: Number (每学期最多可记录次数，-1表示不限制)
-   `max_score_per_semester`: Number (每学期该项目最高累计分数，-1表示不限制)

---

## 5. `score_records` (德育积分记录)

所有积分变动的流水总账。

-   `_id`: String (自动生成的主键)
-   `record_id`: String (记录ID, **业务主键, 需确保唯一**)
-   `student_id`: String (关联到 `students`)
-   `item_id`: String (关联到 `score_items`)
-   `score_change`: Number (本次实际的分数变化)
-   `reason_detail`: String (具体事由的补充说明, 可选)
-   `date`: Date (发生日期)
-   `recorder_name`: String (记录人)
-   `semester_id`: String (关联到 `semesters`)
-   `source_record_id`: String (可选, 用于标记此记录是由哪条原始记录折算而来, 例如关联到处分记录ID)
-   `is_converted`: Boolean (是否为折算记录)
-   `conversion_rule_id`: String (折算规则ID，仅当is_converted为true时有效)
-   `original_item_name`: String (原始项目名称，用于折算记录显示)

---

## 6. `dorm_score_records` (住宿积分记录)

专门记录住宿积分的变动，与普通积分分开管理。

-   `_id`: String (自动生成的主键)
-   `record_id`: String (记录ID, **业务主键, 需确保唯一**)
-   `student_id`: String (关联到 `students`)
-   `item_id`: String (关联到 `score_items`，必须是住宿管理类别)
-   `score_change`: Number (本次实际的分数变化)
-   `reason_detail`: String (具体事由的补充说明, 可选)
-   `date`: Date (发生日期)
-   `recorder_name`: String (记录人)
-   `semester_id`: String (关联到 `semesters`)
-   `building`: String (楼栋)
-   `room`: String (房间号)
-   `converted_record_id`: String (关联的折算记录ID，可选)
-   `check_type`: String (检查类型，例如："卫生检查"，"纪律检查"，"安全检查"，"内务整理")

---

## 7. `dorm_score_conversion_rules` (宿舍积分折算规则)

定义宿舍积分如何按比例折算计入总德育分。

-   `_id`: String (自动生成的主键)
-   `rule_id`: String (规则ID, **业务主键, 需确保唯一**)
-   `name`: String (规则名称)
-   `semester_id`: String (关联到 `semesters`)
-   `add_ratio`: Number (加分折算比例, 例如: 0.5)
-   `deduct_ratio`: Number (扣分折算比例, 例如: 0.2)
-   `start_date`: Date (生效日期)
-   `end_date`: Date (失效日期)
-   `is_active`: Boolean (是否启用)
-   `category_mappings`: Array (项目类别映射)
    -   `dorm_category`: String (住宿积分类别，例如："卫生检查")
    -   `target_item_id`: String (对应的普通积分项目ID)
    -   `description`: String (映射说明)

---

## 8. `warnings` (预警信息)

记录所有触发的预警信息。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到 `students`)
-   `type`: String ("留宿察看" / "勒令退宿")
-   `trigger_score`: Number (触发预警时的住宿分数)
-   `semester_id`: String (关联到 `semesters`)
-   `timestamp`: Date (触发时间)
-   `status`: String ("已通知", "已处理", "已撤销")
-   `handler_name`: String (处理人)
-   `handling_date`: Date (处理日期)
-   `handling_result`: String (处理结果)
-   `notes`: String (备注)

---

## 9. `users` (应用用户信息)

存储小程序的用户，区别于学生档案，用于权限控制。

-   `_id`: String (自动生成的主键)
-   `_openid`: String (用户在小程序下的唯一标识, **业务主键**)
-   `role`: String (角色, 例如: 'teacher', 'student', 'parent', 'admin', 'dorm_admin')
-   `nickname`: String (微信昵称)
-   `avatarUrl`: String (微信头像地址)
-   `student_id`: String (可选, 如果用户是学生或家长，关联到`students`集合)
-   `last_login`: Date (最后登录时间)
-   `permissions`: Array (权限列表)
    -   `module`: String (模块名称)
    -   `actions`: Array (允许的操作，例如：["read", "write", "delete"])

---

## 10. `attendance_records` (考勤记录)

记录学生的日常考勤情况。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到 `students`)
-   `date`: Date (考勤日期)
-   `status`: String ("迟到", "早退", "事假", "病假", "旷课")
-   `period`: String (具体时间段, 例如: "第一节课", "晚自习")
-   `reason`: String (原因说明, 可选)
-   `recorder_name`: String (记录人)
-   `semester_id`: String (关联到 `semesters`)
-   `related_leave_id`: String (可选, 关联到 `leave_requests`)
-   `related_score_record_id`: String (可选, 关联到 `score_records`, 记录因此产生的扣分)
-   `check_in_time`: Date (签到时间，可选)
-   `check_out_time`: Date (签退时间，可选)
-   `location`: String (签到地点，可选)
-   `is_excused`: Boolean (是否已获准，例如请假获批)

---

## 11. `attendance_daily` (日常考勤登记表)

基于"23物流1班日常考勤登记"截图设计，用于记录每日考勤详情。

-   `_id`: String (自动生成的主键)
-   `date`: Date (考勤日期)
-   `class_name`: String (班级名称)
-   `semester_id`: String (关联到 `semesters`)
-   `attendance_records`: Array (当日考勤记录)
    -   `student_id`: String (关联到 `students`)
    -   `morning_status`: String ("正常", "迟到", "早退", "事假", "病假", "旷课")
    -   `afternoon_status`: String ("正常", "迟到", "早退", "事假", "病假", "旷课")
    -   `evening_status`: String ("正常", "迟到", "早退", "事假", "病假", "旷课")
    -   `notes`: String (备注信息, 可选)
-   `recorder_name`: String (记录人)
-   `record_time`: Date (记录时间)
-   `is_holiday`: Boolean (是否为假日)
-   `is_finalized`: Boolean (是否已确认，防止误修改)

---

## 12. `leave_requests` (请假申请)

管理学生的请假申请流程。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到 `students`)
-   `type`: String ("事假", "病假")
-   `start_time`: Date (请假开始时间)
-   `end_time`: Date (请假结束时间)
-   `duration`: Number (请假时长, 单位: 小时)
-   `reason`: String (请假事由)
-   `attachments`: Array (附件图片/文件URL列表, 可选)
-   `status`: String ("待审批", "已批准", "已驳回", "已销假")
-   `approver_name`: String (审批人, 批准或驳回该申请的教师)
-   `approval_comment`: String (审批意见, 可选)
-   `request_date`: Date (申请提交日期)
-   `cancellation_date`: Date (销假日期, 可选)
-   `semester_id`: String (关联到 `semesters`)
-   `affected_courses`: Array (受影响的课程，可选)
    -   `course_name`: String (课程名称)
    -   `teacher_name`: String (任课教师)
    -   `time_slot`: String (时间段)
-   `is_emergency`: Boolean (是否紧急请假)

---

## 13. `discipline_records` (处分记录)

记录对学生的正式处分。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到 `students`)
-   `type`: String ("警告", "严重警告", "记过", "记大过", "留校察看", "开除学籍")
-   `reason`: String (处分原因)
-   `document_id`: String (处分文件编号, 可选)
-   `issue_date`: Date (处分下达日期)
-   `issuer`: String (发布单位/人, 例如: "学生处")
-   `is_revoked`: Boolean (是否已撤销)
-   `revocation_date`: Date (撤销日期, 可选)
-   `revocation_reason`: String (撤销原因, 可选)
-   `semester_id`: String (关联到 `semesters`)
-   `related_score_record_id`: String (可选, 关联到 `score_records`, 记录因此产生的扣分)
-   `discipline_code`: String (关联到 `discipline_base_data` 的处分代码)
-   `effective_period`: Number (处分有效期，单位：月)
-   `expiration_date`: Date (处分到期日期)
-   `has_application_for_revocation`: Boolean (是否有撤销申请)

---

## 14. `discipline_base_data` (处分基础数据表)

基于"处分基础数据表"截图设计，定义各类处分的标准信息。

-   `_id`: String (自动生成的主键)
-   `discipline_code`: String (处分代码, **业务主键**)
-   `discipline_name`: String (处分名称)
-   `discipline_level`: Number (处分等级, 1-6对应不同严重程度)
-   `score_deduction`: Number (对应扣分)
-   `description`: String (处分描述)
-   `applicable_conditions`: String (适用条件)
-   `is_active`: Boolean (是否启用)
-   `default_effective_period`: Number (默认有效期，单位：月)
-   `can_be_revoked`: Boolean (是否可撤销)
-   `revocation_conditions`: String (撤销条件)

---

## 15. `revocation_applications` (撤销申请子表)

基于"撤销申请子表"截图设计，管理处分撤销申请流程。

-   `_id`: String (自动生成的主键)
-   `discipline_record_id`: String (关联到 `discipline_records`)
-   `student_id`: String (关联到 `students`)
-   `application_date`: Date (申请日期)
-   `application_reason`: String (申请撤销理由)
-   `supporting_materials`: Array (支撑材料URL列表)
-   `status`: String ("待审核", "已批准", "已拒绝")
-   `reviewer_name`: String (审核人)
-   `review_date`: Date (审核日期)
-   `review_comments`: String (审核意见)
-   `semester_id`: String (关联到 `semesters`)
-   `teacher_recommendation`: String (班主任推荐意见，可选)
-   `student_self_reflection`: String (学生自我反思，可选)

---

## 16. `competition_records` (竞赛获奖记录)

记录学生参加各类竞赛及获奖情况。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到 `students`)
-   `competition_name`: String (竞赛名称)
-   `award_level`: String (获奖等级, 例如: "国家级一等奖", "省级二等奖", "校级优秀奖")
-   `award_date`: Date (获奖日期)
-   `issuing_authority`: String (颁奖单位)
-   `certificate_url`: String (获奖证书扫描件URL, 可选)
-   `recorder_name`: String (记录人)
-   `semester_id`: String (关联到 `semesters`)
-   `related_score_record_id`: String (可选, 关联到 `score_records`, 记录因此产生的加分)
-   `competition_id`: String (关联到 `competition_main`)
-   `team_members`: Array (团队成员，团队竞赛时使用)
    -   `student_id`: String (学生ID)
    -   `role`: String (角色，例如："队长"，"队员")
-   `mentor_name`: String (指导教师，可选)
-   `project_name`: String (项目名称，可选)

---

## 17. `competition_main` (技能竞赛主表)

基于"技能竞赛主表"截图设计，管理竞赛活动信息。

-   `_id`: String (自动生成的主键)
-   `competition_id`: String (竞赛ID, **业务主键**)
-   `competition_name`: String (竞赛名称)
-   `competition_type`: String (竞赛类型, 例如: "技能竞赛", "学科竞赛")
-   `competition_level`: String (竞赛级别, 例如: "国家级", "省级", "市级", "校级")
-   `organizer`: String (主办单位)
-   `competition_date`: Date (竞赛日期)
-   `registration_deadline`: Date (报名截止日期)
-   `description`: String (竞赛描述)
-   `award_settings`: Array (奖项设置)
    -   `award_name`: String (奖项名称)
    -   `award_score`: Number (对应加分)
    -   `quota`: Number (名额)
-   `semester_id`: String (关联到 `semesters`)
-   `is_team_competition`: Boolean (是否为团队竞赛)
-   `max_team_size`: Number (最大团队人数，团队竞赛时有效)
-   `registration_status`: String ("未开始"，"报名中"，"已截止"，"已结束")
-   `attachments`: Array (附件URL列表，例如竞赛通知、规则等)

---

## 18. `certificate_details` (证书明细表)

基于"证书明细表"截图设计，详细记录学生获得的各类证书。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到 `students`)
-   `certificate_type`: String (证书类型, 例如: "技能证书", "荣誉证书", "资格证书")
-   `certificate_name`: String (证书名称)
-   `issuing_authority`: String (颁发机构)
-   `certificate_number`: String (证书编号)
-   `issue_date`: Date (颁发日期)
-   `validity_period`: String (有效期, 可选)
-   `certificate_image_url`: String (证书图片URL)
-   `verification_status`: String ("已验证", "待验证", "验证失败")
-   `related_competition_id`: String (关联竞赛ID, 可选)
-   `semester_id`: String (关联到 `semesters`)
-   `score_value`: Number (证书对应积分值，可选)
-   `related_score_record_id`: String (关联积分记录ID，可选)
-   `verification_method`: String (验证方式，例如："官网查询"，"电话验证")
-   `verification_code`: String (验证码，可选)

---

## 19. `volunteer_records` (志愿服务记录)

记录学生的志愿服务活动。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到 `students`)
-   `activity_name`: String (活动名称)
-   `organization`: String (组织单位)
-   `date`: Date (服务日期)
-   `duration`: Number (服务时长, 单位: 小时)
-   `description`: String (服务内容简述)
-   `recorder_name`: String (记录人)
-   `semester_id`: String (关联到 `semesters`)
-   `related_score_record_id`: String (可选, 关联到 `score_records`, 记录因此产生的加分)
-   `location`: String (服务地点)
-   `service_type`: String (服务类型，例如："社区服务"，"环保活动"，"助老助残")
-   `feedback_rating`: Number (反馈评分，1-5分)
-   `feedback_comments`: String (反馈意见，可选)
-   `proof_image_url`: Array (证明图片URL列表，可选)
-   `is_verified`: Boolean (是否已验证)
-   `verifier_name`: String (验证人，可选)

---

## 20. `daily_score_summary` (日常积分计算表格)

基于"日常积分计算表格"截图设计，用于汇总学生的各类积分。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到 `students`)
-   `semester_id`: String (关联到 `semesters`)
-   `calculation_date`: Date (计算日期)
-   `score_breakdown`: Object (积分明细)
    -   `moral_score`: Number (品德积分)
    -   `attendance_score`: Number (考勤积分)
    -   `dormitory_score`: Number (宿舍积分)
    -   `competition_score`: Number (竞赛积分)
    -   `volunteer_score`: Number (志愿服务积分)
    -   `discipline_deduction`: Number (处分扣分)
-   `total_score`: Number (总积分)
-   `score_level`: String (积分等级)
-   `class_rank`: Number (班级排名)
-   `previous_total`: Number (上次统计总分，用于计算变化)
-   `score_change`: Number (分数变化)
-   `last_updated`: Date (最后更新时间)
-   `is_published`: Boolean (是否已公布)

---

## 21. `dormitory_residents` (住宿同学管理)

基于"住宿同学管理"截图设计，专门管理住宿生信息。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到 `students`)
-   `semester_id`: String (关联到 `semesters`)
-   `dorm_info`: Object (住宿详细信息)
    -   `building`: String (楼栋)
    -   `floor`: Number (楼层)
    -   `room`: String (房间号)
    -   `bed_number`: Number (床位号)
    -   `room_type`: String (房间类型, 例如: "4人间", "6人间")
-   `check_in_date`: Date (入住日期)
-   `check_out_date`: Date (退宿日期, 可选)
-   `roommates`: Array (室友学生ID列表)
-   `room_leader_id`: String (宿舍长学生ID, 可选)
-   `status`: String ("在住", "已退宿", "申请调宿")
-   `special_notes`: String (特殊说明, 可选)
-   `initial_dorm_score`: Number (学期初始住宿积分)
-   `current_dorm_score`: Number (当前住宿积分)
-   `warning_count`: Number (预警次数)
-   `has_active_warning`: Boolean (是否有活跃预警)
-   `last_check_date`: Date (最后检查日期)

---

## 22. `dormitory_score_details` (住宿生积分表)

基于"住宿生积分表"截图设计，详细记录住宿积分明细。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到 `students`)
-   `semester_id`: String (关联到 `semesters`)
-   `record_date`: Date (记录日期)
-   `score_items`: Array (积分项目明细)
    -   `item_category`: String (项目类别, 例如: "卫生检查", "纪律检查", "安全检查", "内务整理")
    -   `item_name`: String (具体项目名称)
    -   `score_change`: Number (分数变化)
    -   `checker_name`: String (检查人)
    -   `check_time`: Date (检查时间)
    -   `notes`: String (备注)
-   `daily_total`: Number (当日总分)
-   `cumulative_score`: Number (累计积分)
-   `recorder_name`: String (记录人)
-   `building`: String (楼栋)
-   `room`: String (房间号)
-   `is_group_check`: Boolean (是否为集体检查)
-   `check_type`: String (检查类型，例如："日常检查"，"周检"，"月检"，"突击检查")
-   `image_urls`: Array (检查照片URL列表，可选)

---

## 23. `grade_records` (学生成绩记录)

基于"学生成绩单表"截图设计，存储学生在各类考试中的成绩。

-   `_id`: String (自动生成的主键)
-   `student_id`: String (关联到 `students`)
-   `semester_id`: String (关联到 `semesters`)
-   `exam_type`: String (考试类型, 例如: "期中考试", "期末考试", "月考")
-   `exam_name`: String (考试名称)
-   `exam_date`: Date (考试日期)
-   `subjects`: Array (各科成绩)
    -   `subject_name`: String (科目名称)
    -   `score`: Number (得分)
    -   `full_marks`: Number (满分)
    -   `pass_score`: Number (及格分数)
    -   `grade_point`: Number (绩点, 可选)
    -   `teacher_name`: String (任课教师)
    -   `comments`: String (教师评语，可选)
-   `total_score`: Number (总分)
-   `average_score`: Number (平均分)
-   `class_rank`: Number (班级排名, 可选)
-   `grade_rank`: Number (年级排名, 可选)
-   `recorder_name`: String (录入人)
-   `record_date`: Date (录入日期)
-   `is_published`: Boolean (是否已公布给学生)
-   `parent_confirmed`: Boolean (家长是否已确认查看)

---

## 24. `redemption_items` (积分可兑换物品)

基于"积分兑换申请表"截图设计，定义可供学生使用积分兑换的物品或权益。

-   `_id`: String (自动生成的主键)
-   `item_id`: String (物品ID, **业务主键, 需确保唯一**)
-   `name`: String (物品或权益名称, 例如: "文具盒", "免一次作业")
-   `description`: String (详细描述)
-   `image_url`: String (展示图片URL, 可选)
-   `points_cost`: Number (兑换所需积分)
-   `stock`: Number (库存数量, -1表示无限)
-   `category`: String (分类, 例如: "实物奖品", "虚拟权益")
-   `is_active`: Boolean (是否上架/可兑换)
-   `created_date`: Date (创建日期)
-   `creator_name`: String (创建人)
-   `expiration_date`: Date (过期日期，可选)
-   `redemption_limit`: Number (每人兑换限制，-1表示不限)
-   `min_score_requirement`: Number (兑换所需最低总积分，可选)
-   `special_conditions`: String (特殊兑换条件，可选)

---

## 25. `redemption_requests` (积分兑换申请)

基于"积分兑换申请表"截图设计，记录学生的积分兑换申请。

-   `_id`: String (自动生成的主键)
-   `application_id`: String (申请单号, **业务主键**)
-   `student_id`: String (关联到 `students`)
-   `item_id`: String (关联到 `redemption_items`)
-   `item_name`: String (兑换物品名称, 冗余存储)
-   `points_cost`: Number (兑换时消耗的积分)
-   `quantity`: Number (兑换数量)
-   `request_date`: Date (申请日期)
-   `status`: String ("待处理", "已批准", "已拒绝", "已发放")
-   `approver_name`: String (处理人)
-   `approval_date`: Date (处理日期, 可选)
-   `delivery_method`: String (发放方式, 例如: "现场领取", "邮寄")
-   `notes`: String (备注, 可选)
-   `related_score_record_id`: String (关联到 `score_records`, 记录因此产生的积分扣减)
-   `semester_id`: String (关联到 `semesters`)
-   `delivery_date`: Date (实际发放日期，可选)
-   `student_confirmation`: Boolean (学生是否已确认收到)
-   `confirmation_date`: Date (确认日期，可选)
-   `rejection_reason`: String (拒绝原因，可选)

---

## 26. `student_groups` (学生分组管理表)

基于"学生分组管理表"截图设计，用于学习小组、项目小组等多种分组场景。

-   `_id`: String (自动生成的主键)
-   `group_id`: String (小组ID, **业务主键**)
-   `group_name`: String (小组名称, 例如: "第一学习小组")
-   `class_name`: String (所属班级)
-   `semester_id`: String (关联到 `semesters`)
-   `group_type`: String (分组类型, 例如: "学习小组", "项目小组", "宿舍内务组")
-   `leader_student_id`: String (组长, 关联到 `students`)
-   `members`: Array (小组成员信息)
    -   `student_id`: String (学生ID)
    -   `role`: String (角色, 例如: "组长", "组员", "副组长")
    -   `join_date`: Date (加入日期)
-   `group_objectives`: String (小组目标或任务)
-   `performance_metrics`: Object (小组表现指标, 可选)
    -   `total_score`: Number (小组总积分)
    -   `average_score`: Number (小组平均积分)
    -   `ranking`: Number (小组排名)
-   `creation_date`: Date (创建日期)
-   `creator_name`: String (创建人)
-   `is_active`: Boolean (是否仍在活动)
-   `end_date`: Date (结束日期，可选)
-   `evaluation`: String (小组评价，可选)
-   `achievements`: Array (小组成果，可选)
    -   `title`: String (成果标题)
    -   `description`: String (成果描述)
    -   `date`: Date (完成日期)
    -   `attachment_urls`: Array (附件URL列表)

---

## 27. `classroom_seating` (教室座位表)

基于"教室座位表"截图设计，管理班级座位安排。

-   `_id`: String (自动生成的主键)
-   `class_name`: String (班级名称)
-   `semester_id`: String (关联到 `semesters`)
-   `seating_plan_name`: String (座位方案名称)
-   `effective_date`: Date (生效日期)
-   `is_current`: Boolean (是否为当前方案)
-   `classroom_layout`: Object (教室布局)
    -   `total_rows`: Number (总行数)
    -   `total_cols`: Number (总列数)
    -   `seat_arrangement`: Array (座位安排)
        -   `row`: Number (行号)
        -   `col`: Number (列号)
        -   `student_id`: String (学生ID, 空座位为null)
        -   `is_special_seat`: Boolean (是否特殊座位, 如讲台附近)
-   `creator_name`: String (创建人)
-   `notes`: String (备注)
-   `rotation_frequency`: String (轮换频率，例如："每周"，"每月"，"每学期"，可选)
-   `last_rotation_date`: Date (上次轮换日期，可选)
-   `next_rotation_date`: Date (下次轮换日期，可选)
-   `special_arrangements`: Array (特殊安排，例如视力不良学生的座位安排)
    -   `student_id`: String (学生ID)
    -   `reason`: String (特殊安排原因)
    -   `requirement`: String (具体要求)

---

## 28. `notifications` (通知公告)

管理系统内的各类通知和公告。

-   `_id`: String (自动生成的主键)
-   `notification_id`: String (通知ID, **业务主键**)
-   `title`: String (通知标题)
-   `content`: String (通知内容)
-   `type`: String (通知类型, 例如: "公告", "活动", "提醒", "警告")
-   `priority`: String (优先级, 例如: "普通", "重要", "紧急")
-   `publisher_id`: String (发布者ID, 关联到 `users`)
-   `publisher_name`: String (发布者姓名)
-   `publish_date`: Date (发布日期)
-   `expiry_date`: Date (过期日期, 可选)
-   `target_roles`: Array (目标角色, 例如: ["teacher", "student", "parent"])
-   `target_classes`: Array (目标班级, 可选)
-   `attachments`: Array (附件URL列表, 可选)
-   `is_pinned`: Boolean (是否置顶)
-   `is_active`: Boolean (是否有效)
-   `read_count`: Number (阅读次数)
-   `readers`: Array (已读用户ID列表)
-   `comments`: Array (评论, 可选)
    -   `user_id`: String (评论用户ID)
    -   `user_name`: String (评论用户名)
    -   `content`: String (评论内容)
    -   `timestamp`: Date (评论时间)

---

## 数据库索引建议

基于业务查询需求，建议为以下字段创建索引：

### 核心业务索引
-   `students.student_id` (唯一索引)
-   `score_records.student_id` + `semester_id` (复合索引)
-   `attendance_daily.date` + `class_name` (复合索引)
-   `discipline_records.student_id` + `is_revoked` (复合索引)
-   `competition_records.student_id` + `semester_id` (复合索引)
-   `dorm_score_records.student_id` + `semester_id` (复合索引)
-   `dorm_score_records.date` + `building` + `room` (复合索引)

### 查询优化索引
-   `semesters.status` (单字段索引)
-   `dormitory_residents.building` + `room` (复合索引)
-   `grade_records.semester_id` + `exam_type` (复合索引)
-   `redemption_requests.status` + `request_date` (复合索引)
-   `notifications.publish_date` + `is_active` + `priority` (复合索引)
-   `volunteer_records.student_id` + `semester_id` (复合索引)
-   `warnings.student_id` + `status` (复合索引)

---

## 数据完整性约束

### 必填字段约束
-   所有表的 `_id` 字段为必填
-   学生相关记录必须关联有效的 `student_id`
-   时间相关记录必须关联有效的 `semester_id`
-   积分记录必须关联有效的 `item_id`
-   住宿积分记录必须包含有效的宿舍信息

### 业务逻辑约束
-   同一学期只能有一个活跃状态 (`semesters.status = "active"`)
-   学生的住宿信息在同一学期内唯一 (`dormitory_residents`)
-   积分兑换申请的积分消耗不能超过学生当前积分
-   处分撤销申请只能针对未撤销的处分记录
-   住宿积分不能低于0分
-   住宿积分低于预警阈值时自动触发预警机制
-   住宿积分折算必须遵循当前学期的有效折算规则

---

## 数据迁移说明

从线下Excel系统迁移到云数据库时，需要注意：

1. **数据清洗**：确保学号、身份证号等关键字段的唯一性和格式正确性
2. **历史数据处理**：将历史学期的数据正确归档到对应的 `semester_id`
3. **积分计算**：重新计算所有学生的总积分，确保数据一致性
4. **关联关系验证**：确保所有外键关联的数据完整性
5. **住宿积分初始化**：为所有住宿生设置初始住宿积分
6. **折算规则设置**：根据实际业务需求配置住宿积分折算规则
7. **历史预警记录**：迁移历史预警信息，确保连续性

---

## 不确定的内容需要确认

基于线下系统截图分析，以下内容需要您进一步确认：

1. **积分项目库表**：截图中显示的积分项目分类是否需要调整或补充？当前设计的分类包括"品德表现"、"住宿管理"、"考勤"、"竞赛获奖"、"志愿服务"等，是否符合实际需求？

2. **处分等级设置**：处分基础数据表中的等级划分（1-6级）和对应扣分标准是否需要根据学校实际情况调整？

3. **积分兑换商城**：积分兑换物品的分类和库存管理方式是否符合实际运营需求？

4. **考勤时间段**：日常考勤登记表中的时间段划分（上午、下午、晚上）是否需要更细化的时间点设置？

5. **宿舍积分项目**：住宿积分的检查项目分类（卫生检查、纪律检查、安全检查、内务整理）是否需要增加其他类别？

6. **成绩管理**：学生成绩记录中的科目设置和绩点计算方式是否需要根据专业特点进行调整？

7. **住宿积分初始值**：每学期住宿积分的初始值是否固定为100分，还是可以由管理员在学期设置中自定义？

8. **预警阈值设置**：住宿积分的预警阈值和退宿阈值是否需要在学期设置中可配置？

9. **折算规则映射**：住宿积分折算到普通积分时，是否需要更精细的项目映射机制，例如"卫生检查"折算为"品德表现-宿舍卫生"？

---

*本数据库设计文档已基于线下Excel管理系统的截图进行全面分析和扩展，涵盖了班级德育管理的所有核心业务场景，为微信小程序的功能实现提供了完整的数据支撑。*
