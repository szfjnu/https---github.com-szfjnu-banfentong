const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { getCallerInfo, requireTeacher, requireAdmin, AUTH_ERRORS } = require('./utils/auth');

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

async function addBuilding(data, caller) {
  try {
    const now = db.serverDate()
    const res = await db.collection('dorm_buildings').add({
      data: { ...data, created_at: now, updated_at: now }
    })
    return { success: true, data: { _id: res._id } }
  } catch (err) {
    console.error('addBuilding error:', err)
    return { success: false, message: err.message }
  }
}

async function updateBuilding(data, caller) {
  const { _id, ...updateFields } = data || {}
  if (!_id) return { success: false, message: '缺少必要参数: _id' }
  try {
    const now = db.serverDate()
    await db.collection('dorm_buildings').doc(_id).update({
      data: { ...updateFields, updated_at: now }
    })
    return { success: true }
  } catch (err) {
    console.error('updateBuilding error:', err)
    return { success: false, message: err.message }
  }
}

async function deleteBuilding(data, caller) {
  const { _id } = data || {}
  if (!_id) return { success: false, message: '缺少必要参数: _id' }
  try {
    await db.collection('dorm_buildings').doc(_id).remove()
    const roomsRes = await db.collection('dorm_rooms').where({ building_id: _id }).get()
    for (const room of (roomsRes.data || [])) {
      await db.collection('dorm_beds').where({ room_id: room._id }).remove()
      await db.collection('dorm_rooms').doc(room._id).remove()
    }
    return { success: true }
  } catch (err) {
    console.error('deleteBuilding error:', err)
    return { success: false, message: err.message }
  }
}

async function addRoomWithBeds(data, caller) {
  const { building_id, room_number, floor, bed_count, ...rest } = data || {}
  if (!building_id || !room_number || !bed_count) {
    return { success: false, message: '缺少必要参数: building_id, room_number, bed_count' }
  }
  try {
    const now = db.serverDate()
    const roomRes = await db.collection('dorm_rooms').add({
      data: {
        building_id,
        room_number,
        floor: floor || 1,
        ...rest,
        created_at: now,
        updated_at: now
      }
    })
    const roomId = roomRes._id
    const bedResults = []
    for (let i = 1; i <= bed_count; i++) {
      const bedRes = await db.collection('dorm_beds').add({
        data: {
          room_id: roomId,
          building_id,
          bed_number: `${room_number}-${i}`,
          bed_index: i,
          occupied: false,
          student_id: '',
          created_at: now,
          updated_at: now
        }
      })
      bedResults.push(bedRes._id)
    }
    return { success: true, data: { room_id: roomId, bed_ids: bedResults } }
  } catch (err) {
    console.error('addRoomWithBeds error:', err)
    return { success: false, message: err.message }
  }
}

async function updateRoom(data, caller) {
  const { _id, ...updateFields } = data || {}
  if (!_id) return { success: false, message: '缺少必要参数: _id' }
  try {
    const now = db.serverDate()
    await db.collection('dorm_rooms').doc(_id).update({
      data: { ...updateFields, updated_at: now }
    })
    return { success: true }
  } catch (err) {
    console.error('updateRoom error:', err)
    return { success: false, message: err.message }
  }
}

async function deleteRoom(data, caller) {
  const { _id } = data || {}
  if (!_id) return { success: false, message: '缺少必要参数: _id' }
  try {
    await db.collection('dorm_beds').where({ room_id: _id }).remove()
    await db.collection('dorm_rooms').doc(_id).remove()
    return { success: true }
  } catch (err) {
    console.error('deleteRoom error:', err)
    return { success: false, message: err.message }
  }
}

async function addInspectionRecord(data, caller) {
  try {
    const now = db.serverDate()
    const res = await db.collection('dorm_inspection_records').add({
      data: {
        ...data,
        inspector_openid: caller.openid,
        created_at: now,
        updated_at: now
      }
    })
    return { success: true, data: { _id: res._id } }
  } catch (err) {
    console.error('addInspectionRecord error:', err)
    return { success: false, message: err.message }
  }
}

exports.main = async (event, context) => {
  const { action, data } = event;

  try {
    const caller = await getCallerInfo(event, data?.class_id || data?.classId);

    switch (action) {
      case 'getDormCandidates':
        return await getDormCandidates(data || {});

      case 'syncDormInfo':
        requireTeacher(caller);
        return await syncDormInfo(data || {}, caller.openid);

      case 'releaseBed':
        requireTeacher(caller);
        return await releaseBed(data || {}, caller.openid);

      case 'addBuilding':
        requireTeacher(caller);
        return await addBuilding(data || {}, caller);

      case 'updateBuilding':
        requireTeacher(caller);
        return await updateBuilding(data || {}, caller);

      case 'deleteBuilding':
        requireAdmin(caller);
        return await deleteBuilding(data || {}, caller);

      case 'addRoomWithBeds':
        requireTeacher(caller);
        return await addRoomWithBeds(data || {}, caller);

      case 'updateRoom':
        requireTeacher(caller);
        return await updateRoom(data || {}, caller);

      case 'deleteRoom':
        requireTeacher(caller);
        return await deleteRoom(data || {}, caller);

      case 'addInspectionRecord':
        requireTeacher(caller);
        return await addInspectionRecord(data || {}, caller);

      default:
        return { success: false, message: '未知操作' };
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
    return { success: false, message: err.message || '服务器错误', code: 'INTERNAL_ERROR' };
  }
};
