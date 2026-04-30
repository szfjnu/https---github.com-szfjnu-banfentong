# 宿舍管理云函数使用文档

## 📦 云函数列表

### 1. generateDormStatistics - 生成宿舍统计报表

**功能说明**：根据时间维度（日/周/月/学期）生成宿舍积分统计报表。

**调用参数**：
```javascript
wx.cloud.callFunction({
  name: 'generateDormStatistics',
  data: {
    class_id: 'class001',           // 必填：班级ID
    stat_type: 'daily',             // 可选：统计类型 daily/weekly/monthly/semester
    stat_date: '2025-04-02',        // 可选：统计日期，默认今天
    building: 'A栋',                // 可选：楼栋筛选
    room: '101'                     // 可选：房间筛选
  }
})
```

**返回数据**：
```javascript
{
  success: true,
  message: '统计报表生成成功',
  data: {
    stat_id: 'stat_class001_daily_2025-04-02',
    class_id: 'class001',
    semester_id: '2025-2026-2',
    stat_type: 'daily',
    stat_date: '2025-04-02',
    total_deduction_score: 15,      // 总扣分
    total_add_score: 5,             // 总加分
    net_score: -10,                 // 净积分
    deduction_count: 3,             // 扣分次数
    add_count: 1,                   // 加分次数
    violation_count: 3,             // 违规次数
    top_violations: [               // 高频违规Top5
      { rule_name: '地面不干净', count: 2 },
      { rule_name: '物品摆放混乱', count: 1 }
    ],
    score_distribution: {           // 积分分布
      excellent: 20,                // 优秀 90-100
      good: 15,                     // 良好 70-89
      pass: 10,                     // 合格 60-69
      warning: 5,                   // 预警 40-59
      critical: 2                   // 危险 0-39
    },
    inspection_stats: {             // 检查统计
      total_inspections: 5,         // 检查总次数
      avg_score: 75,                // 平均分
      pass_rate: 0.8                // 合格率
    }
  }
}
```

**使用场景**：
- 宿舍积分统计页面展示
- 生成周报、月报
- 数据分析和导出

---

### 2. checkDormWarnings - 检查并生成宿舍积分预警

**功能说明**：检查学生的宿舍积分情况，自动生成预警信息。

**调用参数**：
```javascript
wx.cloud.callFunction({
  name: 'checkDormWarnings',
  data: {
    class_id: 'class001',           // 可选：班级ID（不填则检查所有）
    student_id: 'S001',             // 可选：学生学号（检查单个学生）
    check_type: 'all'               // 可选：检查类型 all/score/trend
  }
})
```

**返回数据**：
```javascript
{
  success: true,
  message: '预警检查完成，生成 3 条预警',
  data: {
    checked_count: 50,              // 检查学生数
    warning_count: 3,               // 预警数量
    warnings: [
      {
        warning_id: 'warn_S001_1712000000000',
        student_id: 'S001',
        student_name: '张三',
        warning_level: 'red',       // 黄色/橙色/红色
        trigger_score: 35,
        current_score: 35,
        deduction_count: 5,         // 近7天扣分次数
        suggestions: [              // 改进建议
          { suggestion: '请立即与班主任或宿管老师沟通', priority: 1 }
        ]
      }
    ]
  }
}
```

**预警等级规则**：
- **红色预警**：积分 < 40 或 近7天扣分 ≥ 5次
- **橙色预警**：积分 < 50 或 近7天扣分 ≥ 3次
- **黄色预警**：积分 < 70 或 扣分趋势上升

**使用场景**：
- 每日自动检查预警
- 学生添加扣分记录后触发
- 宿管老师手动检查

---

### 3. convertDormScore - 宿舍积分折算

**功能说明**：将宿舍积分按比例折算到学生总积分。

**调用参数**：
```javascript
wx.cloud.callFunction({
  name: 'convertDormScore',
  data: {
    student_id: 'S001',             // 必填：学生学号
    dorm_score_change: -5,          // 必填：宿舍积分变动（负数为扣分）
    recorder_openid: 'openid123',   // 可选：记录人openid
    semester_id: '2025-2026-2'      // 可选：学期ID
  }
})
```

**返回数据**：
```javascript
{
  success: true,
  message: '宿舍积分折算完成',
  data: {
    dorm_score_change: -5,          // 宿舍积分变动
    converted_score_change: -2,     // 折算后积分变动
    conversion_ratio: 0.3,          // 折算比例
    warning_type: '留宿察看'        // 预警类型（如有）
  }
}
```

**折算逻辑**：
1. 从学期配置获取折算比例（默认 0.3）
2. 计算折算积分 = 宿舍积分变动 × 折算比例
3. 更新宿舍积分账户
4. 创建日常积分记录
5. 更新学生总积分
6. 检查是否触发预警

**使用场景**：
- 添加宿舍扣分记录时调用
- 批量折算历史积分
- 学期末积分结算

---

## ⏰ 定时任务配置

建议在云开发控制台配置定时触发器，自动运行统计和预警检查。

### 1. 每日统计报表生成

**触发器配置**：
```json
{
  "triggers": [
    {
      "name": "dailyStatistics",
      "type": "timer",
      "config": "0 0 23 * * * *"  // 每天23:00执行
    }
  ]
}
```

**云函数入口修改**：
```javascript
// 在 generateDormStatistics/index.js 中添加
const wxContext = cloud.getWXContext()

// 定时触发时自动统计所有班级
if (wxContext.ENV_SOURCE === 'timer') {
  const classesRes = await db.collection('classes').get()
  for (const cls of classesRes.data) {
    await generateStatistics(cls._id, 'daily')
  }
}
```

### 2. 每日预警检查

**触发器配置**：
```json
{
  "triggers": [
    {
      "name": "dailyWarningCheck",
      "type": "timer",
      "config": "0 0 8 * * * *"  // 每天08:00执行
    }
  ]
}
```

### 3. 每周统计报表生成

**触发器配置**：
```json
{
  "triggers": [
    {
      "name": "weeklyStatistics",
      "type": "timer",
      "config": "0 0 23 * * 0 *"  // 每周日23:00执行
    }
  ]
}
```

---

## 🚀 部署步骤

### 1. 上传云函数

在微信开发者工具中：

1. 右键点击 `cloudfunctions/generateDormStatistics`
2. 选择"上传并部署：云端安装依赖"
3. 等待部署完成

重复以上步骤部署其他云函数：
- `checkDormWarnings`
- `convertDormScore`（已存在）

### 2. 配置定时触发器（可选）

在云开发控制台：

1. 进入"云函数"页面
2. 选择对应云函数
3. 点击"定时触发器"
4. 添加触发器配置
5. 保存并启用

### 3. 测试云函数

在云开发控制台或小程序代码中测试：

```javascript
// 测试生成统计报表
wx.cloud.callFunction({
  name: 'generateDormStatistics',
  data: {
    class_id: 'class001',
    stat_type: 'daily'
  }
}).then(res => {
  console.log('统计结果:', res.result)
})

// 测试预警检查
wx.cloud.callFunction({
  name: 'checkDormWarnings',
  data: {
    class_id: 'class001'
  }
}).then(res => {
  console.log('预警结果:', res.result)
})

// 测试积分折算
wx.cloud.callFunction({
  name: 'convertDormScore',
  data: {
    student_id: 'S001',
    dorm_score_change: -5
  }
}).then(res => {
  console.log('折算结果:', res.result)
})
```

---

## 📊 数据库依赖

这些云函数依赖以下数据库集合：

| 集合名 | 用途 |
|--------|------|
| `semesters` | 学期配置（折算比例、预警阈值） |
| `students` | 学生信息（宿舍积分、住宿状态） |
| `classes` | 班级信息（班级配置） |
| `dorm_score_records` | 宿舍积分记录 |
| `dorm_score_accounts` | 宿舍积分账户 |
| `dorm_inspection_records` | 宿舍检查记录 |
| `dorm_statistics` | 宿舍统计报表 |
| `dorm_warnings` | 宿舍预警记录 |
| `score_records` | 日常积分记录（折算后） |

---

## 💡 最佳实践

### 1. 业务流程集成

在添加宿舍扣分记录时，建议按以下顺序调用：

```javascript
// 1. 创建宿舍积分记录
await db.collection('dorm_score_records').add({ data: recordData })

// 2. 调用积分折算
await wx.cloud.callFunction({
  name: 'convertDormScore',
  data: {
    student_id: studentId,
    dorm_score_change: scoreChange
  }
})

// 3. 检查预警
await wx.cloud.callFunction({
  name: 'checkDormWarnings',
  data: { student_id: studentId }
})

// 4. 更新统计（可选）
await wx.cloud.callFunction({
  name: 'generateDormStatistics',
  data: {
    class_id: classId,
    stat_type: 'daily'
  }
})
```

### 2. 错误处理

```javascript
try {
  const res = await wx.cloud.callFunction({
    name: 'checkDormWarnings',
    data: { class_id: classId }
  })
  
  if (res.result.success) {
    console.log('预警检查成功:', res.result.message)
  } else {
    console.error('预警检查失败:', res.result.message)
  }
} catch (error) {
  console.error('云函数调用失败:', error)
}
```

### 3. 性能优化

- 批量操作时，使用事务保证数据一致性
- 定时任务在低峰期执行（如深夜）
- 统计数据缓存，减少实时计算

---

## 🔧 故障排查

### 问题1：云函数调用超时

**原因**：数据量过大或查询效率低

**解决方案**：
- 添加数据库索引
- 分批处理数据
- 增加云函数超时时间（默认20秒）

### 问题2：统计报表数据不准确

**原因**：时间范围计算错误或数据未同步

**解决方案**：
- 检查 `getDateRange` 函数逻辑
- 确保所有数据已写入数据库
- 手动触发重新生成统计

### 问题3：预警重复生成

**原因**：未检查已有生效预警

**解决方案**：
- 云函数已内置重复检查逻辑
- 检查 `status: 'active'` 的预警记录

---

## 📞 技术支持

如有问题，请查看：
1. 云函数日志（云开发控制台）
2. 数据库数据是否正确
3. 调用参数是否符合要求
