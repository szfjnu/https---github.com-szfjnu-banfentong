# 测试数据导入指南

## 概述

根据当前已完成的功能(登录、首页、学生管理、积分管理),需要添加以下测试数据:
1. **semesters** - 学期信息(必需)
2. **students** - 学生信息(必需)
3. **score_items** - 积分项目(必需)

## 一、学期数据 (semesters)

### 添加方式
在云开发控制台 → 数据库 → semesters集合 → 添加记录

### 测试数据
```json
{
  "name": "2025-2026第一学期",
  "start_date": "2025-09-01",
  "end_date": "2026-01-31",
  "status": "active",
  "description": "2025-2026学年第一学期",
  "initial_score": 100,
  "dorm_initial_score": 100,
  "dorm_conversion_ratio": 0.3,
  "dorm_warning_threshold": 60,
  "dorm_critical_threshold": 40,
  "is_initialized": true,
  "created_at": "2025-09-01",
  "updated_at": "2025-09-01"
}
```

### 注意事项
- 只能有一个学期status为"active"
- initial_score默认100分

## 二、学生数据 (students)

### 添加方式
在云开发控制台 → 数据库 → students集合 → 添加记录

### 测试数据示例

**学生1:**
```json
{
  "student_id": "2025001",
  "name": "张三",
  "gender": "男",
  "class_name": "计算机1班",
  "is_boarding": true,
  "position": "班长",
  "current_score": 95,
  "initial_score": 100,
  "phone_number": "13800138001",
  "parent_phone_number": "13900139001",
  "dorm_info": {
    "building": "1栋",
    "room": "101",
    "bed": 1
  },
  "dorm_score": 90,
  "dorm_initial_score": 100,
  "created_at": "2025-09-01",
  "updated_at": "2025-09-01"
}
```

**学生2:**
```json
{
  "student_id": "2025002",
  "name": "李四",
  "gender": "女",
  "class_name": "计算机1班",
  "is_boarding": false,
  "position": "学习委员",
  "current_score": 88,
  "initial_score": 100,
  "phone_number": "13800138002",
  "parent_phone_number": "13900139002",
  "created_at": "2025-09-01",
  "updated_at": "2025-09-01"
}
```

**学生3:**
```json
{
  "student_id": "2025003",
  "name": "王五",
  "gender": "男",
  "class_name": "计算机1班",
  "is_boarding": true,
  "current_score": 92,
  "initial_score": 100,
  "phone_number": "13800138003",
  "parent_phone_number": "13900139003",
  "dorm_info": {
    "building": "1栋",
    "room": "102",
    "bed": 1
  },
  "dorm_score": 85,
  "created_at": "2025-09-01",
  "updated_at": "2025-09-01"
}
```

**学生4:**
```json
{
  "student_id": "2025004",
  "name": "赵六",
  "gender": "女",
  "class_name": "计算机1班",
  "is_boarding": false,
  "current_score": 78,
  "initial_score": 100,
  "phone_number": "13800138004",
  "parent_phone_number": "13900139004",
  "created_at": "2025-09-01",
  "updated_at": "2025-09-01"
}
```

**学生5:**
```json
{
  "student_id": "2025005",
  "name": "孙七",
  "gender": "男",
  "class_name": "计算机1班",
  "is_boarding": true,
  "current_score": 85,
  "initial_score": 100,
  "phone_number": "13800138005",
  "parent_phone_number": "13900139005",
  "dorm_info": {
    "building": "1栋",
    "room": "102",
    "bed": 2
  },
  "dorm_score": 88,
  "created_at": "2025-09-01",
  "updated_at": "2025-09-01"
}
```

### 建议添加数量
- 至少添加5-10个学生
- 包含不同积分等级(优秀、良好、合格、待改进)
- 包含住宿生和非住宿生

## 三、积分项目数据 (score_items)

### 添加方式
在云开发控制台 → 数据库 → score_items集合 → 添加记录

### 测试数据

**加分项目1:**
```json
{
  "item_id": "SCORE001",
  "name": "主动回答问题",
  "category": "学习表现",
  "default_score": 2,
  "type": "加分",
  "description": "课堂主动回答问题并正确",
  "is_active": true,
  "requires_approval": false,
  "max_times_per_semester": -1,
  "max_score_per_semester": -1,
  "created_at": "2025-09-01",
  "updated_at": "2025-09-01"
}
```

**加分项目2:**
```json
{
  "item_id": "SCORE002",
  "name": "作业优秀",
  "category": "学习表现",
  "default_score": 3,
  "type": "加分",
  "description": "作业完成质量优秀",
  "is_active": true,
  "requires_approval": false,
  "max_times_per_semester": -1,
  "max_score_per_semester": -1,
  "created_at": "2025-09-01",
  "updated_at": "2025-09-01"
}
```

**加分项目3:**
```json
{
  "item_id": "SCORE003",
  "name": "帮助同学",
  "category": "品德表现",
  "default_score": 2,
  "type": "加分",
  "description": "主动帮助同学解决问题",
  "is_active": true,
  "requires_approval": false,
  "max_times_per_semester": -1,
  "max_score_per_semester": -1,
  "created_at": "2025-09-01",
  "updated_at": "2025-09-01"
}
```

**扣分项目1:**
```json
{
  "item_id": "SCORE004",
  "name": "迟到",
  "category": "考勤",
  "default_score": -2,
  "type": "扣分",
  "description": "上课迟到",
  "is_active": true,
  "requires_approval": false,
  "max_times_per_semester": -1,
  "max_score_per_semester": -1,
  "created_at": "2025-09-01",
  "updated_at": "2025-09-01"
}
```

**扣分项目2:**
```json
{
  "item_id": "SCORE005",
  "name": "作业未交",
  "category": "学习表现",
  "default_score": -3,
  "type": "扣分",
  "description": "未按时提交作业",
  "is_active": true,
  "requires_approval": false,
  "max_times_per_semester": -1,
  "max_score_per_semester": -1,
  "created_at": "2025-09-01",
  "updated_at": "2025-09-01"
}
```

**扣分项目3:**
```json
{
  "item_id": "SCORE006",
  "name": "宿舍卫生不合格",
  "category": "住宿管理",
  "default_score": -5,
  "type": "扣分",
  "description": "宿舍卫生检查不合格",
  "is_active": true,
  "requires_approval": false,
  "max_times_per_semester": -1,
  "max_score_per_semester": -1,
  "created_at": "2025-09-01",
  "updated_at": "2025-09-01"
}
```

### 建议添加数量
- 至少添加6-10个积分项目
- 包含加分和扣分项目
- 覆盖不同类别(学习表现、品德表现、考勤、住宿管理)

## 四、数据导入步骤

### 步骤1: 创建集合
在云开发控制台创建以下集合:
- semesters
- students
- score_items

### 步骤2: 设置权限
将所有集合权限设置为: **所有用户可读,仅创建者可写**

### 步骤3: 导入数据
1. 点击集合名称
2. 点击"添加记录"
3. 选择"JSON"格式
4. 粘贴上述测试数据
5. 点击"确定"

### 步骤4: 验证数据
在云开发控制台查看数据是否正确导入

## 五、测试功能清单

### 1. 登录功能测试
- ✅ 选择角色登录
- ✅ 学生/家长输入学号登录
- ✅ 登录成功跳转首页

### 2. 首页功能测试
- ✅ 显示用户信息
- ✅ 显示统计数据(学生总数、平均积分等)
- ✅ 显示快捷操作入口

### 3. 学生管理测试
- ✅ 显示学生列表
- ✅ 搜索学生(学号/姓名)
- ✅ 显示学生积分和等级
- ✅ 下拉刷新

### 4. 积分管理测试
- ✅ 显示积分排行榜
- ✅ 前三名金银铜标识
- ✅ 搜索学生
- ✅ 显示积分等级和颜色

## 六、注意事项

1. **数据一致性**: student_id必须唯一
2. **学期状态**: 只能有一个active学期
3. **积分范围**: 建议学生积分在60-100之间,便于测试不同等级
4. **权限设置**: 确保数据库权限正确
5. **日期格式**: 使用标准日期格式(YYYY-MM-DD)

## 七、快速导入脚本

如果需要批量导入,可以使用云函数或小程序代码批量添加。参考代码:

```javascript
// 批量添加学生
const students = [
  { student_id: "2025001", name: "张三", ... },
  { student_id: "2025002", name: "李四", ... },
  // ...
];

const db = wx.cloud.database();
for (let student of students) {
  await db.collection('students').add({ data: student });
}
```

---

**导入完成后,即可测试所有已完成的功能!**
