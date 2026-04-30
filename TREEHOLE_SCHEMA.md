# 心灵树洞 - 数据库结构定义

## 集合：treehole_posts

存储匿名/实名情感帖子，按班级维度隔离。

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | String | 自动生成 | 主键 |
| `class_id` | String | 是 | 班级ID，用于数据隔离 |
| `content` | String | 是 | 帖子内容，最长500字 |
| `mood` | String | 否 | 心情标签，枚举: happy/sad/anxious/angry/confused/peaceful |
| `is_anonymous` | Boolean | 否 | 是否匿名，默认 true |
| `author_id` | String | 是 | 作者 openid（仅管理员可见） |
| `author_name` | String | 否 | 作者姓名（非匿名时展示） |
| `hearts_count` | Number | 否 | 鼓励数，默认 0 |
| `replies_count` | Number | 否 | 回复数，默认 0 |
| `is_reported` | Boolean | 否 | 是否被举报，默认 false |
| `report_reason` | String | 否 | 举报原因 |
| `reported_by` | String | 否 | 举报人 openid |
| `status` | String | 否 | 帖子状态，枚举: normal/hidden/deleted，默认 normal |
| `created_at` | Date | 否 | 创建时间 |
| `updated_at` | Date | 否 | 更新时间 |

### 示例文档

```json
{
  "_id": "auto_generated",
  "class_id": "cls_abc123",
  "content": "最近考试压力好大，感觉喘不过气来...",
  "mood": "anxious",
  "is_anonymous": true,
  "author_id": "oXXXX_openid",
  "author_name": "",
  "hearts_count": 5,
  "replies_count": 2,
  "is_reported": false,
  "report_reason": "",
  "reported_by": "",
  "status": "normal",
  "created_at": "2024-03-15T10:00:00.000Z",
  "updated_at": "2024-03-15T10:00:00.000Z"
}
```

## 集合：treehole_replies

存储帖子回复。

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | String | 自动生成 | 主键 |
| `class_id` | String | 是 | 班级ID |
| `post_id` | String | 是 | 关联 treehole_posts._id |
| `content` | String | 是 | 回复内容，最长200字 |
| `is_anonymous` | Boolean | 否 | 是否匿名，默认 true |
| `author_id` | String | 是 | 作者 openid |
| `author_name` | String | 否 | 作者姓名（非匿名时展示） |
| `is_teacher` | Boolean | 否 | 是否教师回复，默认 false |
| `created_at` | Date | 否 | 创建时间 |

## 集合：treehole_hearts

存储鼓励（点赞）记录，用于去重。

### 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | String | 自动生成 | 主键 |
| `post_id` | String | 是 | 关联 treehole_posts._id |
| `user_id` | String | 是 | 鼓励者 openid |
| `created_at` | Date | 否 | 创建时间 |

### 推荐索引

```json
{
  "treehole_posts": [
    { "keys": { "class_id": 1, "status": 1, "created_at": -1 } },
    { "keys": { "class_id": 1, "is_reported": 1 } },
    { "keys": { "author_id": 1, "created_at": -1 } }
  ],
  "treehole_replies": [
    { "keys": { "post_id": 1, "created_at": 1 } },
    { "keys": { "class_id": 1 } }
  ],
  "treehole_hearts": [
    { "keys": { "post_id": 1, "user_id": 1 }, "unique": true }
  ]
}
```

### 数据隔离规则

- 所有查询必须包含 `class_id` 条件
- 学生/家长只能查看本班帖子
- 班主任/管理员可管理（隐藏/删除）本班帖子
- 举报仅本班成员可操作
