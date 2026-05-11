const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { getCallerInfo, requireTeacher, AUTH_ERRORS } = require('../utils/auth');

function validateParams(data, requiredFields) {
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      return { valid: false, missing: field };
    }
  }
  return { valid: true };
}

async function getDormCandidates(data) {
  const { level, building_id, room_id } = data;
  const validation = validateParams(data, ['level']);
  if (!validation.valid) {
    return { success: false, message: `缺少参数: ${validation.missing}` };
  }

  try {
    if (level === 'buildings') {
      const res = await db.collection('dorm_buildings')
        .orderBy('building_code', 'asc')
        .limit(100)
        .get();
      const buildings = (res.data || []).map(b => ({
        _id: b._id,
        building_name: b.building_name,
        building_code: b.building_code
      }));
      return { success: true, data: buildings };
    }

    if (level === 'rooms') {
      const v = validateParams(data, ['building_id']);
      if (!v.valid) return { success: false, message: `缺少参数: ${v.missing}` };

      const res = await db.collection('dorm_rooms')
        .where({ building_id })
        .orderBy('room_number', 'asc')
        .limit(100)
        .get();
      const rooms = (res.data || []).map(r => ({
        _id: r._id,
        room_number: r.room_number,
        floor: r.floor
      }));
      return { success: true, data: rooms };
    }

    if (level === 'beds') {
      const v = validateParams(data, ['room_id']);
      if (!v.valid) return { success: false, message: `缺少参数: ${v.missing}` };

      const res = await db.collection('dorm_beds')
        .where({ room_id })
        .orderBy('bed_index', 'asc')
        .limit(100)
        .get();

      const beds = await Promise.all((res.data || []).map(async (b) => {
        const bedItem = {
          _id: b._id,
          bed_number: b.bed_number,
          bed_index: b.bed_index,
          occupied: b.occupied || false,
          student_id: b.student_id || '',
          student_name: ''
        };
        if (b.occupied && b.student_id) {
          try {
            const studentRes = await db.collection('students')
              .where({ _id: b.student_id })
              .limit(1)
              .get();
            if (!studentRes.data || studentRes.data.length === 0) {
              const byStudentId = await db.collection('students')
                .where({ student_id: b.student_id })
                .limit(1)
                .get();
              if (byStudentId.data && byStudentId.data.length > 0) {
                bedItem.student_name = byStudentId.data[0].name || '';
              }
            } else {
              bedItem.student_name = studentRes.data[0].name || '';
            }
          } catch (e) {
            console.error('查询学生姓名失败:', e);
          }
        }
        return bedItem;
      }));

      return { success: true, data: beds };
    }

    return { success: false, message: '未知level参数' };
  } catch (err) {
    console.error('getDormCandidates error:', err);
    return { success: false, message: err.message || '查询候选数据失败' };
  }
}

async function syncDormInfo(data, openid) {
  const { student_doc_id, building_id, room_id, bed_id, force_replace } = data;
  const validation = validateParams(data, ['student_doc_id', 'building_id', 'room_id', 'bed_id']);
  if (!validation.valid) {
    return { success: false, message: `缺少参数: ${validation.missing}`, code: 'PARAM_MISSING' };
  }

  try {
    const bedRes = await db.collection('dorm_beds').doc(bed_id).get();
    const targetBed = bedRes.data;
    if (!targetBed) {
      return { success: false, message: '目标床位不存在', code: 'BED_NOT_FOUND' };
    }

    const roomRes = await db.collection('dorm_rooms').doc(room_id).get();
    const targetRoom = roomRes.data;
    if (!targetRoom || targetRoom.building_id !== building_id) {
      return { success: false, message: '关联ID不一致：房间不属于该楼栋', code: 'DATA_INCONSISTENT' };
    }
    if (targetBed.room_id !== room_id) {
      return { success: false, message: '关联ID不一致：床位不属于该房间', code: 'DATA_INCONSISTENT' };
    }

    if (targetBed.occupied && targetBed.student_id && targetBed.student_id !== student_doc_id) {
      if (!force_replace) {
        let occupantName = '';
        try {
          const occRes = await db.collection('students').doc(targetBed.student_id).get();
          occupantName = occRes.data ? occRes.data.name : '';
        } catch (e) {
          try {
            const occRes2 = await db.collection('students')
              .where({ student_id: targetBed.student_id }).limit(1).get();
            occupantName = (occRes2.data && occRes2.data.length > 0) ? occRes2.data[0].name : '';
          } catch (e2) { }
        }
        return {
          success: false,
          message: `该床位已被${occupantName || '其他学生'}入住`,
          code: 'BED_OCCUPIED',
          occupied_by: targetBed.student_id,
          occupied_by_name: occupantName
        };
      }
    }

    const buildingRes = await db.collection('dorm_buildings').doc(building_id).get();
    const buildingName = buildingRes.data ? buildingRes.data.building_name : '';
    const roomNumber = targetRoom.room_number || '';
    const bedNumber = targetBed.bed_number ? targetBed.bed_number.split('-').pop() : '';

    const transaction = await db.runTransaction(async (t) => {
      const studentRes = await t.collection('students').doc(student_doc_id).get();
      const student = studentRes.data;
      if (!student) {
        throw new Error('STUDENT_NOT_FOUND');
      }

      const oldBedId = student.dorm_bed_id || '';
      if (oldBedId && oldBedId !== bed_id) {
        try {
          const oldBedRes = await t.collection('dorm_beds').doc(oldBedId).get();
          if (oldBedRes.data) {
            await t.collection('dorm_beds').doc(oldBedId).update({
              data: { occupied: false, student_id: '' }
            });
          }
        } catch (e) {
          console.warn('旧床位记录不存在，跳过释放:', oldBedId);
        }
      }

      if (targetBed.occupied && targetBed.student_id &&
          targetBed.student_id !== student_doc_id && force_replace) {
        try {
          const conflictRes = await t.collection('students').doc(targetBed.student_id).get();
          if (conflictRes.data) {
            await t.collection('students').doc(targetBed.student_id).update({
              data: {
                is_boarding: false,
                dorm_info: {},
                dorm_building_id: '',
                dorm_room_id: '',
                dorm_bed_id: ''
              }
            });
          }
        } catch (e) {
          console.warn('冲突学生记录不存在:', targetBed.student_id);
        }
      }

      await t.collection('dorm_beds').doc(bed_id).update({
        data: {
          occupied: true,
          student_id: student_doc_id
        }
      });

      await t.collection('students').doc(student_doc_id).update({
        data: {
          is_boarding: true,
          dorm_info: {
            building: buildingName,
            room: roomNumber,
            bed: bedNumber
          },
          dorm_building_id: building_id,
          dorm_room_id: room_id,
          dorm_bed_id: bed_id
        }
      });

      return { old_bed_id: oldBedId, new_bed_id: bed_id };
    });

    return {
      success: true,
      data: {
        student_doc_id,
        old_bed_id: transaction.old_bed_id,
        new_bed_id: transaction.new_bed_id,
        dorm_info: { building: buildingName, room: roomNumber, bed: bedNumber }
      }
    };
  } catch (err) {
    console.error('syncDormInfo error:', err);
    if (err.message === 'STUDENT_NOT_FOUND') {
      return { success: false, message: '学生记录不存在', code: 'STUDENT_NOT_FOUND' };
    }
    return { success: false, message: '同步写入失败，已自动回滚', code: 'SYNC_FAILED' };
  }
}

async function releaseBed(data, openid) {
  const { student_doc_id } = data;
  const validation = validateParams(data, ['student_doc_id']);
  if (!validation.valid) {
    return { success: false, message: `缺少参数: ${validation.missing}`, code: 'PARAM_MISSING' };
  }

  try {
    const transaction = await db.runTransaction(async (t) => {
      const studentRes = await t.collection('students').doc(student_doc_id).get();
      const student = studentRes.data;
      if (!student) {
        throw new Error('STUDENT_NOT_FOUND');
      }

      const oldBedId = student.dorm_bed_id || '';
      let repaired = false;

      if (oldBedId) {
        try {
          const bedRes = await t.collection('dorm_beds').doc(oldBedId).get();
          if (bedRes.data) {
            await t.collection('dorm_beds').doc(oldBedId).update({
              data: { occupied: false, student_id: '' }
            });
          }
        } catch (e) {
          repaired = true;
          console.warn('床位记录不存在，跳过释放:', oldBedId);
        }
      }

      await t.collection('students').doc(student_doc_id).update({
        data: {
          is_boarding: false,
          dorm_info: {},
          dorm_building_id: '',
          dorm_room_id: '',
          dorm_bed_id: ''
        }
      });

      return { released_bed_id: oldBedId, repaired };
    });

    return {
      success: true,
      data: {
        student_doc_id,
        released_bed_id: transaction.released_bed_id,
        repaired: transaction.repaired
      }
    };
  } catch (err) {
    console.error('releaseBed error:', err);
    if (err.message === 'STUDENT_NOT_FOUND') {
      return { success: false, message: '学生记录不存在', code: 'STUDENT_NOT_FOUND' };
    }
    return { success: false, message: '退宿操作失败，已自动回滚', code: 'RELEASE_FAILED' };
  }
}

exports.main = async (event, context) => {
  const { action, data } = event;

  if (!action) {
    return { success: false, message: '缺少action参数' };
  }

  if (action === 'getDormCandidates') {
    return await getDormCandidates(data || {});
  }

  if (action === 'syncDormInfo' || action === 'releaseBed') {
    try {
      const caller = await getCallerInfo(event);
      requireTeacher(caller);

      if (action === 'syncDormInfo') {
        return await syncDormInfo(data || {}, caller.openid);
      }
      if (action === 'releaseBed') {
        return await releaseBed(data || {}, caller.openid);
      }
    } catch (err) {
      if (Object.values(AUTH_ERRORS).includes(err.code)) {
        const msgMap = {
          [AUTH_ERRORS.NO_OPENID]: '未获取到用户身份',
          [AUTH_ERRORS.NO_CLASS]: '用户未加入任何班级',
          [AUTH_ERRORS.NO_ACCESS]: '无权操作此班级',
          [AUTH_ERRORS.ROLE_DENIED]: err.message,
          [AUTH_ERRORS.CLASS_DENIED]: '无权访问该班级数据'
        }
        return { success: false, message: msgMap[err.code] || err.message, code: 'PERMISSION_DENIED' };
      }
      console.error('dormSyncManager error:', err);
      return { success: false, message: '服务器错误', code: 'INTERNAL_ERROR' };
    }
  }

  return { success: false, message: '未知操作' };
};
