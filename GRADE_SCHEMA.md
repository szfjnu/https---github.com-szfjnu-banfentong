# 成绩管理中心 - 数据库结构定义

## 集合：grades

存储学生考试成绩数据，按班级维度隔离。

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | String | 自动生成 | 主键 |
| `class_id` | String | 是 | 班级ID，关联 classes.class_id，用于数据隔离 |
| `student_id` | String | 是 | 学生学号，关联 students.student_id |
| `student_name` | String | 否 | 学生姓名（冗余存储，便于展示） |
| `subject` | String | 是 | 科目名称，如'数学'、'语文'、'英语' |
| `score` | Number | 是 | 分数，0-150 |
| `exam_type` | String | 是 | 考试类型，枚举: monthly(月考)/midterm(期中)/final(期末) |
| `term` | String | 是 | 学期，如'2024春季'、'2024秋季' |
| `total_score` | Number | 否 | 该学生本次考试所有科目总分（汇总字段） |
| `rank_class` | Number | 否 | 班级排名（按总分降序计算） |
| `rank_grade` | Number | 否 | 年级排名（暂未使用） |
| `is_pass` | Boolean | 否 | 是否及格，score < 60 为 false，默认 true |
| `created_by` | String | 是 | 录入人 openid |
| `created_at` | Date | 否 | 创建时间 |
| `updated_at` | Date | 否 | 更新时间 |

### 示例文档

```json
{
  "_id": "auto_generated",
  "class_id": "cls_abc123",
  "student_id": "2024001",
  "student_name": "张三",
  "subject": "数学",
  "score": 95,
  "exam_type": "monthly",
  "term": "2024春季",
  "total_score": 0,
  "rank_class": 1,
  "rank_grade": null,
  "is_pass": true,
  "created_by": "oXXXX_openid",
  "created_at": "2024-03-15T10:00:00.000Z",
  "updated_at": "2024-03-15T10:00:00.000Z"
}
```

### 推荐索引

```json
{
  "indexes": [
    { "keys": { "class_id": 1, "term": 1, "exam_type": 1 } },
    { "keys": { "class_id": 1, "student_id": 1, "term": 1 } },
    { "keys": { "student_id": 1, "subject": 1, "term": 1, "exam_type": 1 } },
    { "keys": { "class_id": 1, "term": 1, "exam_type": 1, "rank_class": 1 } }
  ]
}
```

### 数据隔离规则

- 所有查询必须包含 `class_id` 条件
- 科任老师只能查询自己教授的科目数据
- 学生/家长只能查询自己的成绩数据
