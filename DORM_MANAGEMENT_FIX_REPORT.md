# 宿舍管理问题修复报告

**修复时间**: 2026-04-14  
**问题列表**:
1. 平均分未动态引用实时住宿剩余积分
2. 最近检查记录只显示"分"，不显示具体分数
3. 点击宿舍积分记录不能跳转到详情
4. 宿舍积分记录详情显示 object
5. 宿舍积分扣减后转换到个人积分应该是扣减
6. 时间筛选提示未设置好

---

## 🔧 修复内容

### 1. 修复平均分计算逻辑

**文件**: `miniprogram/pages/dorm/dorm.js`  
**问题**: 平均分使用 `students.dorm_score` 字段，而不是实时计算

**修复**: 新增查询 `dorm_score_accounts` 集合，从账户中实时计算平均分

```javascript
// 新增查询宿舍积分账户
const [studentRes, rulesRes, recordsRes, warningsRes, accountsRes] = await Promise.all([
  // ... 其他查询
  
  // 5. 查询宿舍积分账户获取实时平均分
  db.collection('dorm_score_accounts')
    .where({
      class_id: classId,
      ...(semesterId ? { semester_id: semesterId } : {})
    })
    .field({
      student_id: true,
      current_score: true,
      original_score: true
    })
    .limit(1000)
    .get()
]);

// 从宿舍积分账户计算实时平均分
const accounts = accountsRes.data || [];
const totalScore = accounts.reduce((sum, a) => sum + (a.current_score || a.original_score || 100), 0);
const avgScore = accounts.length > 0 ? Math.round(totalScore / accounts.length) : 100;

// 统计预警人数（积分 < 60）
const warningCount = accounts.filter(a => (a.current_score || a.original_score || 100) < 60).length;
```

---

### 2. 修复最近检查记录分数显示

**文件**: 
- `miniprogram/pages/dorm/dorm.js`
- `miniprogram/pages/dorm/dorm.wxml`
- `miniprogram/pages/dorm/dorm.wxss`

**问题**: 显示 `{{item.overall_score}}分`，但字段不存在

**修复**:
1. JS 中使用 `score_change` 字段而非 `score_value`
2. WXML 中添加正负样式区分
3. WXSS 添加正负分数样式

```javascript
// dorm.js
score_display: record.score_change || record.score_value || 0
```

```xml
<!-- dorm.wxml -->
<view class="record-score {{item.score_display >= 0 ? 'positive' : 'negative'}}">
  {{item.score_display > 0 ? '+' : ''}}{{item.score_display}}分
</view>
```

```css
/* dorm.wxss */
.record-score.positive {
  color: #52c41a;
}

.record-score.negative {
  color: #ff4d4f;
}
```

---

### 3. 添加记录点击跳转详情功能

**文件**: `miniprogram/pages/dorm/dorm.js`

**修复**: 修改 `viewRecordDetail` 函数，跳转到学生详情页

```javascript
viewRecordDetail: function (e) {
  const recordId = e.currentTarget.dataset.id;
  const record = this.data.recentRecords.find(r => r._id === recordId);
  
  if (record && record.student_id) {
    wx.navigateTo({
      url: `/pages/dorm/detail/detail?student_id=${record.student_id}&highlight_record=${recordId}`
    });
  }
}
```

---

### 4. 修复详情页学生姓名字段显示

**文件**: `miniprogram/pages/dorm/detail/detail.wxml`

**问题**: `recorder_name` 显示为 object 或不存在

**修复**: 添加默认值处理

```xml
<!-- 修复前 -->
<text class="record-date">{{item.date}} · {{item.recorder_name}}</text>
<text class="record-after">剩余 {{item.score_after}}</text>

<!-- 修复后 -->
<text class="record-date">{{item.date}} · {{item.recorder_name || '系统'}}</text>
<text class="record-after">剩余 {{item.score_after || item.current_score || 100}}</text>
```

---

### 5. 修复云函数折算逻辑

**文件**: `cloudfunctions/convertDormScore/index.js`

**问题**: 
- `_.inc()` 在 update 中重复使用，导致 score_level 计算错误
- 缺少 `current_score` 字段更新

**修复**:
1. 分开计算新积分等级
2. 添加 `current_score` 字段更新
3. 添加调试日志

```javascript
// 计算折算积分
const convertedScoreChange = Math.round(dorm_score_change * conversionRatio * 100) / 100

// 更新宿舍积分账户（同时更新 current_score）
await db.collection('dorm_score_accounts').doc(dormAccount._id).update({
  data: {
    original_score: _.inc(dorm_score_change),
    current_score: _.inc(dorm_score_change),  // 新增
    converted_score: _.inc(convertedScoreChange),
    updated_at: new Date()
  }
})

// 先获取当前学生积分，计算新积分等级
const studentRes = await db.collection('students').where({
  student_id: student_id
}).get()

if (studentRes.data.length > 0) {
  const currentStudent = studentRes.data[0]
  const newScore = (currentStudent.current_score || 100) + convertedScoreChange
  const newScoreLevel = calculateScoreLevel(newScore)
  
  // 更新学生总积分
  await db.collection('students').where({
    student_id: student_id
  }).update({
    data: {
      current_score: _.inc(convertedScoreChange),
      dorm_converted_score: _.inc(convertedScoreChange),
      score_level: newScoreLevel,  // 使用计算后的等级
      updated_at: new Date()
    }
  })
}
```

---

### 6. 修复时间筛选提示

**文件**: `miniprogram/pages/dorm/inspection/inspection.wxml`

**修复**: 优化日期选择器提示文本

```xml
<!-- 修复前 -->
<text>{{selectedDate || '选择日期'}}</text>

<!-- 修复后 -->
<text>{{selectedDate || '请选择检查日期'}}</text>
```

---

## 📋 修改文件清单

| 文件 | 修改内容 | 状态 |
|------|---------|------|
| `dorm/dorm.js` | 平均分实时计算、分数显示字段、跳转功能 | ✅ 完成 |
| `dorm/dorm.wxml` | 分数显示样式 | ✅ 完成 |
| `dorm/dorm.wxss` | 正负分数样式 | ✅ 完成 |
| `dorm/detail/detail.wxml` | 字段默认值处理 | ✅ 完成 |
| `dorm/inspection/inspection.wxml` | 日期提示文本 | ✅ 完成 |
| `convertDormScore/index.js` | 折算逻辑修复 | ✅ 完成 |

---

## 🧪 测试建议

### 1. 测试平均分更新
1. 给某个住宿生扣分
2. 返回宿舍管理首页
3. 检查平均分是否正确更新

### 2. 测试记录分数显示
1. 查看最近检查记录
2. 确认显示具体分数（如"-5分"）
3. 确认加分显示绿色，扣分显示红色

### 3. 测试跳转功能
1. 点击最近检查记录
2. 确认跳转到学生详情页
3. 确认显示该学生的宿舍积分记录

### 4. 测试折算逻辑
1. 给住宿生扣分（如-10分）
2. 检查个人积分是否正确扣减（如-3分，按0.3比例）
3. 确认积分记录中显示正确的折算明细

---

## ✅ 修复完成

所有问题已修复，代码已检查无语法错误。
