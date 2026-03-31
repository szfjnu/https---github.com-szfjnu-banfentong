# students 测试数据

## 数据说明

学生基本信息测试数据,与score_records测试数据配套使用。

## 测试数据 (JSON格式)

```json
[
  {
    "_id": "student_001",
    "student_id": "2025001",
    "name": "张三",
    "gender": "男",
    "class_name": "2025级1班",
    "group_id": "",
    "is_boarding": true,
    "position": "班长",
    "student_status_id": "status_001",
    "current_score": 104,
    "initial_score": 100,
    "id_card_number": "110101200501011234",
    "date_of_birth": "2005-01-01T00:00:00.000Z",
    "phone_number": "13800138001",
    "parent_phone_number": "13900139001",
    "home_address": "北京市朝阳区xxx路xxx号",
    "ethnicity": "汉族",
    "native_place": "北京",
    "political_status": "共青团员",
    "postal_code": "100000",
    "enrollment_date": "2025-09-01T00:00:00.000Z",
    "graduated_from": "北京市第一中学",
    "health_status": "良好",
    "height": 175,
    "family_members": [
      {
        "relationship": "父亲",
        "name": "张大伟",
        "age": 45,
        "work_unit": "某公司",
        "position": "经理",
        "phone_number": "13800138001"
      },
      {
        "relationship": "母亲",
        "name": "李小红",
        "age": 43,
        "work_unit": "某学校",
        "position": "教师",
        "phone_number": "13900139001"
      }
    ],
    "resume": [
      {
        "period": "2019-2022",
        "details": "北京市第一中学初中部",
        "reference": "王老师"
      },
      {
        "period": "2022-2025",
        "details": "北京市第一中学高中部",
        "reference": "李老师"
      }
    ],
    "awards_and_punishments": "2024年获得市级三好学生",
    "head_teacher_opinion": "该生表现优秀,学习刻苦",
    "school_opinion": "同意班主任意见",
    "score_level": "良好",
    "dorm_info": {
      "building": "1号楼",
      "room": "101",
      "bed": 1
    },
    "dorm_score": 95,
    "dorm_initial_score": 100,
    "dorm_converted_score": 0,
    "created_at": "2025-09-01T08:00:00.000Z",
    "updated_at": "2025-09-01T08:00:00.000Z",
    "created_by": "admin",
    "updated_by": "admin",
    "operation_history": []
  },
  {
    "_id": "student_002",
    "student_id": "2025002",
    "name": "李四",
    "gender": "女",
    "class_name": "2025级1班",
    "group_id": "",
    "is_boarding": false,
    "position": "学习委员",
    "student_status_id": "status_002",
    "current_score": 110,
    "initial_score": 100,
    "id_card_number": "110101200502021234",
    "date_of_birth": "2005-02-02T00:00:00.000Z",
    "phone_number": "13800138002",
    "parent_phone_number": "13900139002",
    "home_address": "北京市海淀区xxx路xxx号",
    "ethnicity": "汉族",
    "native_place": "北京",
    "political_status": "群众",
    "postal_code": "100001",
    "enrollment_date": "2025-09-01T00:00:00.000Z",
    "graduated_from": "北京市第二中学",
    "health_status": "良好",
    "height": 165,
    "family_members": [
      {
        "relationship": "父亲",
        "name": "李大明",
        "age": 46,
        "work_unit": "某医院",
        "position": "医生",
        "phone_number": "13800138002"
      },
      {
        "relationship": "母亲",
        "name": "王芳",
        "age": 44,
        "work_unit": "某公司",
        "position": "会计",
        "phone_number": "13900139002"
      }
    ],
    "resume": [
      {
        "period": "2019-2022",
        "details": "北京市第二中学初中部",
        "reference": "张老师"
      },
      {
        "period": "2022-2025",
        "details": "北京市第二中学高中部",
        "reference": "刘老师"
      }
    ],
    "awards_and_punishments": "2024年获得校级优秀学生干部",
    "head_teacher_opinion": "该生学习认真,工作负责",
    "school_opinion": "同意班主任意见",
    "score_level": "良好",
    "dorm_score": 0,
    "dorm_initial_score": 0,
    "dorm_converted_score": 0,
    "created_at": "2025-09-01T08:00:00.000Z",
    "updated_at": "2025-09-01T08:00:00.000Z",
    "created_by": "admin",
    "updated_by": "admin",
    "operation_history": []
  },
  {
    "_id": "student_003",
    "student_id": "2025003",
    "name": "王五",
    "gender": "男",
    "class_name": "2025级1班",
    "group_id": "",
    "is_boarding": true,
    "position": "卫生委员",
    "student_status_id": "status_003",
    "current_score": 127,
    "initial_score": 100,
    "id_card_number": "110101200503031234",
    "date_of_birth": "2005-03-03T00:00:00.000Z",
    "phone_number": "13800138003",
    "parent_phone_number": "13900139003",
    "home_address": "北京市西城区xxx路xxx号",
    "ethnicity": "汉族",
    "native_place": "北京",
    "political_status": "共青团员",
    "postal_code": "100002",
    "enrollment_date": "2025-09-01T00:00:00.000Z",
    "graduated_from": "北京市第三中学",
    "health_status": "良好",
    "height": 180,
    "family_members": [
      {
        "relationship": "父亲",
        "name": "王建国",
        "age": 47,
        "work_unit": "某银行",
        "position": "行长",
        "phone_number": "13800138003"
      },
      {
        "relationship": "母亲",
        "name": "赵美丽",
        "age": 45,
        "work_unit": "某机关",
        "position": "公务员",
        "phone_number": "13900139003"
      }
    ],
    "resume": [
      {
        "period": "2019-2022",
        "details": "北京市第三中学初中部",
        "reference": "陈老师"
      },
      {
        "period": "2022-2025",
        "details": "北京市第三中学高中部",
        "reference": "杨老师"
      }
    ],
    "awards_and_punishments": "2024年获得全国数学竞赛一等奖",
    "head_teacher_opinion": "该生品学兼优,全面发展",
    "school_opinion": "同意班主任意见",
    "score_level": "优秀",
    "dorm_info": {
      "building": "1号楼",
      "room": "102",
      "bed": 1
    },
    "dorm_score": 98,
    "dorm_initial_score": 100,
    "dorm_converted_score": 0,
    "created_at": "2025-09-01T08:00:00.000Z",
    "updated_at": "2025-09-01T08:00:00.000Z",
    "created_by": "admin",
    "updated_by": "admin",
    "operation_history": []
  },
  {
    "_id": "student_004",
    "student_id": "2025004",
    "name": "赵六",
    "gender": "女",
    "class_name": "2025级1班",
    "group_id": "",
    "is_boarding": false,
    "position": "体育委员",
    "student_status_id": "status_004",
    "current_score": 95,
    "initial_score": 100,
    "id_card_number": "110101200504041234",
    "date_of_birth": "2005-04-04T00:00:00.000Z",
    "phone_number": "13800138004",
    "parent_phone_number": "13900139004",
    "home_address": "北京市东城区xxx路xxx号",
    "ethnicity": "汉族",
    "native_place": "北京",
    "political_status": "群众",
    "postal_code": "100003",
    "enrollment_date": "2025-09-01T00:00:00.000Z",
    "graduated_from": "北京市第四中学",
    "health_status": "良好",
    "height": 168,
    "family_members": [
      {
        "relationship": "父亲",
        "name": "赵强",
        "age": 48,
        "work_unit": "某工厂",
        "position": "厂长",
        "phone_number": "13800138004"
      },
      {
        "relationship": "母亲",
        "name": "孙丽华",
        "age": 46,
        "work_unit": "某超市",
        "position": "经理",
        "phone_number": "13900139004"
      }
    ],
    "resume": [
      {
        "period": "2019-2022",
        "details": "北京市第四中学初中部",
        "reference": "周老师"
      },
      {
        "period": "2022-2025",
        "details": "北京市第四中学高中部",
        "reference": "吴老师"
      }
    ],
    "awards_and_punishments": "2024年获得校级体育比赛第二名",
    "head_teacher_opinion": "该生体育特长突出,学习认真",
    "school_opinion": "同意班主任意见",
    "score_level": "一般",
    "dorm_score": 0,
    "dorm_initial_score": 0,
    "dorm_converted_score": 0,
    "created_at": "2025-09-01T08:00:00.000Z",
    "updated_at": "2025-09-01T08:00:00.000Z",
    "created_by": "admin",
    "updated_by": "admin",
    "operation_history": []
  },
  {
    "_id": "student_005",
    "student_id": "2025005",
    "name": "钱七",
    "gender": "男",
    "class_name": "2025级1班",
    "group_id": "",
    "is_boarding": true,
    "position": "",
    "student_status_id": "status_005",
    "current_score": 100,
    "initial_score": 100,
    "id_card_number": "110101200505051234",
    "date_of_birth": "2005-05-05T00:00:00.000Z",
    "phone_number": "13800138005",
    "parent_phone_number": "13900139005",
    "home_address": "北京市丰台区xxx路xxx号",
    "ethnicity": "汉族",
    "native_place": "北京",
    "political_status": "群众",
    "postal_code": "100004",
    "enrollment_date": "2025-09-01T00:00:00.000Z",
    "graduated_from": "北京市第五中学",
    "health_status": "良好",
    "height": 172,
    "family_members": [
      {
        "relationship": "父亲",
        "name": "钱伟",
        "age": 44,
        "work_unit": "公司",
        "position": "员工",
        "phone_number": "13800138005"
      },
      {
        "relationship": "母亲",
        "name": "刘娟",
        "age": 42,
        "work_unit": "公司",
        "position": "员工",
        "phone_number": "13900139005"
      }
    ],
    "resume": [
      {
        "period": "2019-2022",
        "details": "北京市第五中学初中部",
        "reference": "郑老师"
      },
      {
        "period": "2022-2025",
        "details": "北京市第五中学高中部",
        "reference": "冯老师"
      }
    ],
    "awards_and_punishments": "",
    "head_teacher_opinion": "",
    "school_opinion": "",
    "score_level": "一般",
    "dorm_info": {
      "building": "2号楼",
      "room": "201",
      "bed": 1
    },
    "dorm_score": 92,
    "dorm_initial_score": 100,
    "dorm_converted_score": 0,
    "created_at": "2025-09-01T08:00:00.000Z",
    "updated_at": "2025-09-01T08:00:00.000Z",
    "created_by": "admin",
    "updated_by": "admin",
    "operation_history": []
  }
]
```

## 学生信息说明

### 学生列表
1. **张三** (2025001) - 班长,住宿生,积分104分
2. **李四** (2025002) - 学习委员,非住宿生,积分110分
3. **王五** (2025003) - 卫生委员,住宿生,积分127分
4. **赵六** (2025004) - 体育委员,非住宿生,积分95分
5. **钱七** (2025005) - 普通学生,住宿生,积分100分

### 积分等级
- **优秀**: 120分以上 (王五)
- **良好**: 100-119分 (张三、李四)
- **一般**: 80-99分 (赵六、钱七)

### 住宿情况
- **住宿生**: 张三、王五、钱七
- **非住宿生**: 李四、赵六

## 数据导入方法

### 通过云开发控制台导入
1. 打开微信开发者工具
2. 进入云开发控制台 → 数据库
3. 选择 `students` 集合
4. 点击"导入"按钮
5. 复制上述JSON数据
6. 粘贴到导入框,选择JSON格式
7. 点击确定导入

## 数据关联说明

导入students数据后,确保以下数据表中有对应记录:
- ✅ `score_records`: 包含student_id为2025001、2025002、2025003的记录
- ✅ `volunteer_records`: 包含student_id为2025002的志愿服务记录
- ✅ `discipline_records`: 可选,用于测试处分记录功能

## 测试场景

这些数据可以测试:
1. ✅ 学生详情页面基本信息展示
2. ✅ 积分记录查看
3. ✅ 志愿服务记录查看
4. ✅ 处分记录查看
5. ✅ 住宿信息展示
6. ✅ 积分等级和颜色显示
7. ✅ 编辑学生信息功能

## 注意事项

1. ✅ 确保 `student_id` 是唯一的
2. ✅ 确保 `current_score` 与score_records中的记录一致
3. ✅ 住宿生必须有 `dorm_info` 字段
4. ✅ 日期格式必须正确
5. ✅ 导入后检查学生详情页面能否正常显示

## 预期结果

导入后:
- ✅ 积分排行榜显示5个学生
- ✅ 点击学生卡片可以查看详情
- ✅ 学生详情页面显示完整信息
- ✅ 积分记录标签页显示对应记录
- ✅ 志愿服务标签页显示对应记录
