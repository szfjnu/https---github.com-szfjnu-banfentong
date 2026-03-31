# score_records 测试数据

## 数据说明

基于现有系统数据生成,确保与students、score_items、semesters集合保持关联。

## 测试数据 (JSON格式)

```json
[
  {
    "_id": "score_record_001",
    "record_id": "SR20250305001",
    "student_id": "2025001",
    "item_id": "item_001",
    "score_change": 5,
    "reason_detail": "作业完成质量优秀",
    "date": "2025-03-01T08:00:00.000Z",
    "recorder_name": "张老师",
    "recorder_openid": "o6_bmjrPTlm6_2sgVt7hMZOPfL2M",
    "semester_id": "semester_001",
    "source_type": "日常记录",
    "source_record_id": "",
    "approval_status": "已通过",
    "approver_name": "李班主任",
    "approval_time": "2025-03-01T10:00:00.000Z",
    "approval_comment": "同意",
    "created_at": "2025-03-01T08:00:00.000Z"
  },
  {
    "_id": "score_record_002",
    "record_id": "SR20250305002",
    "student_id": "2025001",
    "item_id": "item_002",
    "score_change": -2,
    "reason_detail": "迟到5分钟",
    "date": "2025-03-02T07:30:00.000Z",
    "recorder_name": "王老师",
    "recorder_openid": "o6_bmjrPTlm6_2sgVt7hMZOPfL2M",
    "semester_id": "semester_001",
    "source_type": "日常记录",
    "source_record_id": "",
    "approval_status": "已通过",
    "approver_name": "李班主任",
    "approval_time": "2025-03-02T09:00:00.000Z",
    "approval_comment": "同意",
    "created_at": "2025-03-02T07:30:00.000Z"
  },
  {
    "_id": "score_record_003",
    "record_id": "SR20250305003",
    "student_id": "2025002",
    "item_id": "item_003",
    "score_change": 10,
    "reason_detail": "参加社区志愿服务活动",
    "date": "2025-03-03T14:00:00.000Z",
    "recorder_name": "张老师",
    "recorder_openid": "o6_bmjrPTlm6_2sgVt7hMZOPfL2M",
    "semester_id": "semester_001",
    "source_type": "志愿服务",
    "source_record_id": "vol_001",
    "approval_status": "已通过",
    "approver_name": "李班主任",
    "approval_time": "2025-03-03T16:00:00.000Z",
    "approval_comment": "同意",
    "created_at": "2025-03-03T14:00:00.000Z"
  },
  {
    "_id": "score_record_004",
    "record_id": "SR20250305004",
    "student_id": "2025002",
    "item_id": "item_001",
    "score_change": 3,
    "reason_detail": "课堂表现积极",
    "date": "2025-03-04T10:00:00.000Z",
    "recorder_name": "刘老师",
    "recorder_openid": "o6_bmjrPTlm6_2sgVt7hMZOPfL2M",
    "semester_id": "semester_001",
    "source_type": "日常记录",
    "source_record_id": "",
    "approval_status": "待审核",
    "approver_name": "",
    "approval_time": "",
    "approval_comment": "",
    "created_at": "2025-03-04T10:00:00.000Z"
  },
  {
    "_id": "score_record_005",
    "record_id": "SR20250305005",
    "student_id": "2025003",
    "item_id": "item_004",
    "score_change": 15,
    "reason_detail": "获得市级数学竞赛一等奖",
    "date": "2025-03-05T09:00:00.000Z",
    "recorder_name": "李班主任",
    "recorder_openid": "o6_bmjrPTlm6_2sgVt7hMZOPfL2M",
    "semester_id": "semester_001",
    "source_type": "竞赛获奖",
    "source_record_id": "comp_001",
    "approval_status": "已通过",
    "approver_name": "张校长",
    "approval_time": "2025-03-05T11:00:00.000Z",
    "approval_comment": "优秀表现,同意加分",
    "created_at": "2025-03-05T09:00:00.000Z"
  },
  {
    "_id": "score_record_006",
    "record_id": "SR20250305006",
    "student_id": "2025001",
    "item_id": "item_005",
    "score_change": -5,
    "reason_detail": "未完成卫生值日任务",
    "date": "2025-03-05T16:00:00.000Z",
    "recorder_name": "王老师",
    "recorder_openid": "o6_bmjrPTlm6_2sgVt7hMZOPfL2M",
    "semester_id": "semester_001",
    "source_type": "日常记录",
    "source_record_id": "",
    "approval_status": "待审核",
    "approver_name": "",
    "approval_time": "",
    "approval_comment": "",
    "created_at": "2025-03-05T16:00:00.000Z"
  },
  {
    "_id": "score_record_007",
    "record_id": "SR20250305007",
    "student_id": "2025003",
    "item_id": "item_006",
    "score_change": 8,
    "reason_detail": "获得计算机二级证书",
    "date": "2025-03-06T08:00:00.000Z",
    "recorder_name": "张老师",
    "recorder_openid": "o6_bmjrPTlm6_2sgVt7hMZOPfL2M",
    "semester_id": "semester_001",
    "source_type": "证书获得",
    "source_record_id": "cert_001",
    "approval_status": "已通过",
    "approver_name": "李班主任",
    "approval_time": "2025-03-06T10:00:00.000Z",
    "approval_comment": "同意",
    "created_at": "2025-03-06T08:00:00.000Z"
  },
  {
    "_id": "score_record_008",
    "record_id": "SR20250305008",
    "student_id": "2025002",
    "item_id": "item_007",
    "score_change": -3,
    "reason_detail": "上课玩手机被没收",
    "date": "2025-03-06T14:00:00.000Z",
    "recorder_name": "刘老师",
    "recorder_openid": "o6_bmjrPTlm6_2sgVt7hMZOPfL2M",
    "semester_id": "semester_001",
    "source_type": "日常记录",
    "source_record_id": "",
    "approval_status": "已拒绝",
    "approver_name": "李班主任",
    "approval_time": "2025-03-06T16:00:00.000Z",
    "approval_comment": "情节较轻,暂不扣分,给予警告",
    "created_at": "2025-03-06T14:00:00.000Z"
  },
  {
    "_id": "score_record_009",
    "record_id": "SR20250305009",
    "student_id": "2025001",
    "item_id": "item_008",
    "score_change": 6,
    "reason_detail": "宿舍卫生检查优秀",
    "date": "2025-03-07T09:00:00.000Z",
    "recorder_name": "王老师",
    "recorder_openid": "o6_bmjrPTlm6_2sgVt7hMZOPfL2M",
    "semester_id": "semester_001",
    "source_type": "宿舍折算",
    "source_record_id": "dorm_001",
    "approval_status": "已通过",
    "approver_name": "李班主任",
    "approval_time": "2025-03-07T11:00:00.000Z",
    "approval_comment": "同意",
    "created_at": "2025-03-07T09:00:00.000Z"
  },
  {
    "_id": "score_record_010",
    "record_id": "SR20250305010",
    "student_id": "2025003",
    "item_id": "item_001",
    "score_change": 4,
    "reason_detail": "主动帮助同学解决学习问题",
    "date": "2025-03-08T10:00:00.000Z",
    "recorder_name": "张老师",
    "recorder_openid": "o6_bmjrPTlm6_2sgVt7hMZOPfL2M",
    "semester_id": "semester_001",
    "source_type": "日常记录",
    "source_record_id": "",
    "approval_status": "待审核",
    "approver_name": "",
    "approval_time": "",
    "approval_comment": "",
    "created_at": "2025-03-08T10:00:00.000Z"
  }
]
```

## 关联数据说明

### 1. 学生关联 (student_id)
- `2025001`: 对应students集合中的学生张三
- `2025002`: 对应students集合中的学生李四
- `2025003`: 对应students集合中的学生王五

### 2. 积分项目关联 (item_id)
需要确保score_items集合中有以下项目:
- `item_001`: 作业完成质量优秀 (+5分)
- `item_002`: 迟到扣分 (-2分)
- `item_003`: 志愿服务 (+10分)
- `item_004`: 竞赛获奖 (+15分)
- `item_005`: 未完成值日 (-5分)
- `item_006`: 证书获得 (+8分)
- `item_007`: 上课玩手机 (-3分)
- `item_008`: 宿舍卫生优秀 (+6分)

### 3. 学期关联 (semester_id)
- `semester_001`: 对应semesters集合中的当前学期

### 4. 来源类型 (source_type)
- `日常记录`: 常规的加减分
- `志愿服务`: 志愿服务活动
- `竞赛获奖`: 各类竞赛获奖
- `证书获得`: 技能证书
- `宿舍折算`: 宿舍积分折算

### 5. 审核状态 (approval_status)
- `待审核`: 等待审核
- `已通过`: 审核通过
- `已拒绝`: 审核拒绝

## 数据导入方法

### 方法1: 通过云开发控制台手动导入
1. 打开微信开发者工具
2. 进入云开发控制台
3. 选择数据库
4. 找到score_records集合
5. 点击"导入"按钮
6. 选择JSON格式,粘贴上述数据
7. 点击确定导入

### 方法2: 通过云函数批量导入
如果需要使用云函数导入,可以创建一个云函数来批量插入这些数据。

## 数据一致性检查

导入后请检查:
1. ✅ students集合中存在学号为2025001、2025002、2025003的学生
2. ✅ score_items集合中存在上述item_id的项目
3. ✅ semesters集合中存在semester_001的学期
4. ✅ 小程序积分记录页面能正常显示这些数据
5. ✅ 学生积分能正确计算(初始100分 + 所有记录的score_change)

## 预期结果

导入后,学生的积分应该是:
- 2025001 (张三): 100 + 5 - 2 - 5 + 6 = 104分
- 2025002 (李四): 100 + 10 + 3 - 3 = 110分
- 2025003 (王五): 100 + 15 + 8 + 4 = 127分

这些数据可以用于测试:
- ✅ 积分记录列表展示
- ✅ 多维度筛选功能
- ✅ 审核状态显示
- ✅ 积分变化可视化
- ✅ 数据关联查询
