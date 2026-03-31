# score_items 测试数据

## 数据说明

与score_records测试数据配套的积分项目数据。

## 测试数据 (JSON格式)

```json
[
  {
    "_id": "item_001",
    "item_id": "item_001",
    "name": "作业完成质量优秀",
    "category": "学习表现",
    "default_score": 5,
    "type": "加分",
    "description": "作业完成质量优秀,字迹工整,答案准确",
    "is_active": true,
    "requires_approval": true,
    "max_times_per_semester": -1,
    "max_score_per_semester": -1,
    "applicable_roles": ["班主任", "科任老师", "班干部"],
    "created_at": "2025-02-01T08:00:00.000Z",
    "updated_at": "2025-02-01T08:00:00.000Z"
  },
  {
    "_id": "item_002",
    "item_id": "item_002",
    "name": "迟到扣分",
    "category": "考勤",
    "default_score": -2,
    "type": "扣分",
    "description": "上课迟到,根据迟到时长扣分",
    "is_active": true,
    "requires_approval": true,
    "max_times_per_semester": -1,
    "max_score_per_semester": -1,
    "applicable_roles": ["班主任", "科任老师", "班干部"],
    "created_at": "2025-02-01T08:00:00.000Z",
    "updated_at": "2025-02-01T08:00:00.000Z"
  },
  {
    "_id": "item_003",
    "item_id": "item_003",
    "name": "志愿服务",
    "category": "品德表现",
    "default_score": 10,
    "type": "加分",
    "description": "参加各类志愿服务活动,每小时2分",
    "is_active": true,
    "requires_approval": true,
    "max_times_per_semester": -1,
    "max_score_per_semester": -1,
    "applicable_roles": ["班主任", "科任老师"],
    "created_at": "2025-02-01T08:00:00.000Z",
    "updated_at": "2025-02-01T08:00:00.000Z"
  },
  {
    "_id": "item_004",
    "item_id": "item_004",
    "name": "竞赛获奖",
    "category": "竞赛获奖",
    "default_score": 15,
    "type": "加分",
    "description": "参加各类竞赛获奖,根据级别加分",
    "is_active": true,
    "requires_approval": true,
    "max_times_per_semester": -1,
    "max_score_per_semester": -1,
    "applicable_roles": ["班主任"],
    "created_at": "2025-02-01T08:00:00.000Z",
    "updated_at": "2025-02-01T08:00:00.000Z"
  },
  {
    "_id": "item_005",
    "item_id": "item_005",
    "name": "未完成值日",
    "category": "住宿管理",
    "default_score": -5,
    "type": "扣分",
    "description": "未完成卫生值日任务,根据情节扣分",
    "is_active": true,
    "requires_approval": true,
    "max_times_per_semester": -1,
    "max_score_per_semester": -1,
    "applicable_roles": ["班主任", "卫生委员"],
    "created_at": "2025-02-01T08:00:00.000Z",
    "updated_at": "2025-02-01T08:00:00.000Z"
  },
  {
    "_id": "item_006",
    "item_id": "item_006",
    "name": "证书获得",
    "category": "技能证书",
    "default_score": 8,
    "type": "加分",
    "description": "获得各类技能证书,根据级别加分",
    "is_active": true,
    "requires_approval": true,
    "max_times_per_semester": -1,
    "max_score_per_semester": -1,
    "applicable_roles": ["班主任"],
    "created_at": "2025-02-01T08:00:00.000Z",
    "updated_at": "2025-02-01T08:00:00.000Z"
  },
  {
    "_id": "item_007",
    "item_id": "item_007",
    "name": "上课玩手机",
    "category": "纪律表现",
    "default_score": -3,
    "type": "扣分",
    "description": "上课期间使用手机,影响课堂纪律",
    "is_active": true,
    "requires_approval": true,
    "max_times_per_semester": -1,
    "max_score_per_semester": -1,
    "applicable_roles": ["班主任", "科任老师"],
    "created_at": "2025-02-01T08:00:00.000Z",
    "updated_at": "2025-02-01T08:00:00.000Z"
  },
  {
    "_id": "item_008",
    "item_id": "item_008",
    "name": "宿舍卫生优秀",
    "category": "住宿管理",
    "default_score": 6,
    "type": "加分",
    "description": "宿舍卫生检查优秀,给予奖励",
    "is_active": true,
    "requires_approval": true,
    "max_times_per_semester": -1,
    "max_score_per_semester": -1,
    "applicable_roles": ["班主任", "生活老师"],
    "created_at": "2025-02-01T08:00:00.000Z",
    "updated_at": "2025-02-01T08:00:00.000Z"
  }
]
```

## 积分项目分类

1. **学习表现**: 作业完成质量优秀
2. **考勤**: 迟到扣分
3. **品德表现**: 志愿服务
4. **竞赛获奖**: 竞赛获奖
5. **住宿管理**: 未完成值日、宿舍卫生优秀
6. **技能证书**: 证书获得
7. **纪律表现**: 上课玩手机

## 数据导入方法

### 通过云开发控制台导入
1. 打开微信开发者工具
2. 进入云开发控制台
3. 选择数据库
4. 找到score_items集合
5. 点击"导入"按钮
6. 选择JSON格式,粘贴上述数据
7. 点击确定导入

## 注意事项

1. ✅ 确保item_id与score_records中的item_id对应
2. ✅ 确保is_active为true,这样才能在小程序中显示
3. ✅ 确保created_at和updated_at格式正确
4. ✅ 导入后检查小程序积分记录页面能否正确显示项目名称
