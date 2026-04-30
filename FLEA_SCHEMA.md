# 校园闲鱼 — 数据库 Schema

## 集合 1：flea_items（商品）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| _id | string | 自动 | 记录ID |
| title | string | ✅ | 商品标题 |
| description | string | ✅ | 商品描述 |
| category | string | ✅ | 分类：textbook / electronics / daily / sports / clothing / other |
| price | number | ✅ | 价格（元），0=免费赠送 |
| original_price | number | ❌ | 原价 |
| condition | string | ✅ | 成色：new / like-new / good / fair / poor |
| images | string[] | ❌ | 图片fileID列表，最多9张 |
| seller_id | string | ✅ | 卖家openID |
| seller_name | string | ✅ | 卖家姓名 |
| seller_avatar | string | ❌ | 卖家头像 |
| seller_contact | string | ❌ | 联系方式（可选公开） |
| class_id | string | ✅ | 所属班级 |
| status | string | ✅ | 状态：on_sale / reserved / sold / removed |
| view_count | number | ✅ | 浏览次数，默认0 |
| want_count | number | ✅ | 想要人数，默认0 |
| reserved_for | string | ❌ | 预留买家openID |
| sold_to | string | ❌ | 成交买家openID |
| tags | string[] | ❌ | 自定义标签 |
| created_at | date | ✅ | 发布时间 |
| updated_at | date | ✅ | 更新时间 |

**索引：**
- `class_id` + `status` + `created_at`（复合，列表查询）
- `seller_id` + `status`（我的发布）
- `category` + `class_id`

---

## 集合 2：flea_wants（想要/收藏）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| _id | string | 自动 | 记录ID |
| item_id | string | ✅ | 商品ID |
| user_id | string | ✅ | 用户openID |
| class_id | string | ✅ | 所属班级 |
| created_at | date | ✅ | 创建时间 |

**索引：**
- `item_id` + `user_id`（唯一，去重）

---

## 集合 3：flea_messages（留言/咨询）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| _id | string | 自动 | 记录ID |
| item_id | string | ✅ | 商品ID |
| sender_id | string | ✅ | 发送者openID |
| sender_name | string | ✅ | 发送者姓名 |
| content | string | ✅ | 留言内容 |
| class_id | string | ✅ | 所属班级 |
| created_at | date | ✅ | 发送时间 |

**索引：**
- `item_id` + `created_at`

---

## 集合 4：flea_reports（举报）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| _id | string | 自动 | 记录ID |
| item_id | string | ✅ | 商品ID |
| reporter_id | string | ✅ | 举报人openID |
| reason | string | ✅ | 举报原因 |
| detail | string | ❌ | 补充说明 |
| class_id | string | ✅ | 所属班级 |
| status | string | ✅ | pending / resolved / dismissed |
| created_at | date | ✅ | 举报时间 |

---

## 数据隔离规则

所有查询必须带 `class_id` 过滤，云函数中通过 `user_class_relation` 验证用户身份。
卖家只能操作自己发布的商品（status 变更）。
管理员可下架违规商品。
