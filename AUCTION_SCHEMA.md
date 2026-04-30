# 积分商城 — 数据库 Schema

## 集合 1：auction_items（拍品/兑换项）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| _id | string | 自动 | 记录ID |
| title | string | ✅ | 拍品标题 |
| description | string | ✅ | 拍品描述 |
| image | string | ❌ | 拍品图片fileID |
| type | string | ✅ | 类型：auction(竞拍) / exchange(直兑) |
| category | string | ✅ | 分类：privilege / gift / coupon / service / other |
| starting_price | number | ✅ | 起拍价（积分），直兑则为兑换价 |
| current_price | number | ❌ | 当前最高出价（竞拍型） |
| buyout_price | number | ❌ | 一口价（直兑型即兑换价） |
| total_stock | number | ❌ | 总库存（直兑型），-1=无限 |
| remaining_stock | number | ❌ | 剩余库存 |
| max_per_user | number | ❌ | 每人限购数量，默认1 |
| seller_id | string | ✅ | 发布者openID（教师/管理员） |
| seller_name | string | ✅ | 发布者姓名 |
| class_id | string | ✅ | 所属班级 |
| status | string | ✅ | 状态：upcoming / active / ended / cancelled |
| start_time | date | ✅ | 开始时间 |
| end_time | date | ✅ | 结束时间 |
| winner_id | string | ❌ | 中标者openID（竞拍型） |
| winner_name | string | ❌ | 中标者姓名 |
| bid_count | number | ✅ | 出价/兑换次数，默认0 |
| created_at | date | ✅ | 创建时间 |
| updated_at | date | ✅ | 更新时间 |

**分类映射：**
- privilege: 特权卡（免做作业、座位优先等）
- gift: 实物礼品
- coupon: 优惠券/兑换券
- service: 服务类（当一天班长等）
- other: 其他

**索引：**
- `class_id` + `status` + `created_at`
- `class_id` + `type`
- `seller_id`

---

## 集合 2：auction_bids（出价/兑换记录）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| _id | string | 自动 | 记录ID |
| item_id | string | ✅ | 拍品ID |
| user_id | string | ✅ | 出价者openID |
| user_name | string | ✅ | 出价者姓名 |
| bid_price | number | ✅ | 出价积分 |
| class_id | string | ✅ | 所属班级 |
| status | string | ✅ | 状态：pending / winning / won / lost / refunded |
| created_at | date | ✅ | 出价时间 |

**索引：**
- `item_id` + `user_id`
- `item_id` + `bid_price`（降序，查最高出价）
- `user_id` + `status`（我的竞拍）

---

## 集合 3：auction_redemptions（兑换记录）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| _id | string | 自动 | 记录ID |
| item_id | string | ✅ | 拍品ID |
| user_id | string | ✅ | 兑换者openID |
| user_name | string | ✅ | 兑换者姓名 |
| price | number | ✅ | 消耗积分 |
| class_id | string | ✅ | 所属班级 |
| status | string | ✅ | 状态：pending / fulfilled / cancelled |
| fulfilled_at | date | ❌ | 兑现时间 |
| created_at | date | ✅ | 兑换时间 |

**索引：**
- `item_id` + `user_id`
- `user_id` + `status`

---

## 积分扣除规则

1. **竞拍型**：出价时冻结积分，竞拍结束未中标则退还，中标则永久扣除
2. **直兑型**：兑换时立即扣除积分，不可退还
3. 积分余额查询：从 `scores` 集合中读取当前总积分
4. 积分不足时拒绝出价/兑换
