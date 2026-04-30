# 英雄台 - 数据库结构定义

## 集合：hero_honors

存储荣誉记录，按班级维度隔离。

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | String | 自动生成 | 主键 |
| `class_id` | String | 是 | 班级ID，用于数据隔离 |
| `student_id` | String | 是 | 学生学号 |
| `student_name` | String | 是 | 学生姓名（冗余） |
| `honor_type` | String | 是 | 荣誉类型，枚举: academic/behavior/volunteer/progress/special |
| `title` | String | 是 | 荣誉标题，如"月度之星""进步达人" |
| `description` | String | 否 | 荣誉描述/颁奖词，最长300字 |
| `icon` | String | 否 | 图标/徽章标识，如"trophy"/"star"/"fire" |
| `awarded_by` | String | 是 | 颁奖人 openid |
| `awarded_by_name` | String | 否 | 颁奖人姓名 |
| `cheers_count` | Number | 否 | 喝彩数，默认 0 |
| `period` | String | 否 | 周期标识，如"2024-03"(月度)/"2024-W10"(周度) |
| `is_pinned` | Boolean | 否 | 是否置顶，默认 false |
| `status` | String | 否 | 状态，枚举: normal/revoked，默认 normal |
| `created_at` | Date | 否 | 创建时间 |
| `updated_at` | Date | 否 | 更新时间 |

### 荣誉类型说明

| honor_type | 说明 | 示例标题 |
|------------|------|----------|
| academic | 学业之星 | 月考冠军、单科王 |
| behavior | 行为模范 | 课堂之星、礼仪标兵 |
| volunteer | 志愿先锋 | 志愿之星、服务达人 |
| progress | 进步达人 | 最大进步奖、逆袭之星 |
| special | 特殊荣誉 | 特别贡献、全勤之星 |

### 示例文档

```json
{
  "_id": "auto_generated",
  "class_id": "cls_abc123",
  "student_id": "2024001",
  "student_name": "张三",
  "honor_type": "academic",
  "title": "月考冠军",
  "description": "本次月考总分排名第一，是大家学习的榜样！",
  "icon": "trophy",
  "awarded_by": "oXXXX_openid",
  "awarded_by_name": "李老师",
  "cheers_count": 12,
  "period": "2024-03",
  "is_pinned": false,
  "status": "normal",
  "created_at": "2024-03-15T10:00:00.000Z",
  "updated_at": "2024-03-15T10:00:00.000Z"
}
```

## 集合：hero_cheers

存储喝彩记录，用于去重。

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | String | 自动生成 | 主键 |
| `honor_id` | String | 是 | 关联 hero_honors._id |
| `user_id` | String | 是 | 喝彩者 openid |
| `created_at` | Date | 否 | 创建时间 |

## 集合：hero_templates

存储荣誉模板（班主任可自定义）。

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | String | 自动生成 | 主键 |
| `class_id` | String | 是 | 班级ID |
| `honor_type` | String | 是 | 荣誉类型 |
| `title` | String | 是 | 模板标题 |
| `description` | String | 否 | 默认描述 |
| `icon` | String | 否 | 默认图标 |
| `created_by` | String | 是 | 创建人 openid |
| `created_at` | Date | 否 | 创建时间 |

### 推荐索引

```json
{
  "hero_honors": [
    { "keys": { "class_id": 1, "status": 1, "created_at": -1 } },
    { "keys": { "class_id": 1, "honor_type": 1 } },
    { "keys": { "class_id": 1, "period": 1 } },
    { "keys": { "student_id": 1, "created_at": -1 } },
    { "keys": { "class_id": 1, "is_pinned": -1, "created_at": -1 } }
  ],
  "hero_cheers": [
    { "keys": { "honor_id": 1, "user_id": 1 }, "unique": true }
  ],
  "hero_templates": [
    { "keys": { "class_id": 1, "honor_type": 1 } }
  ]
}
```

### 数据隔离规则

- 所有查询必须包含 `class_id` 条件
- 仅班主任/管理员可颁发/撤销荣誉
- 学生/家长只能查看和喝彩
