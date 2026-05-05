const BATCH_SIZE = 50
const MAX_LIMIT = 100
const DATA_TOO_LARGE_THRESHOLD = 3000

const VALID_ACTIONS = ['importStudent', 'exportStudent', 'exportScoreRecords', 'exportAttendance', 'importSchedule']

const ALLOWED_IMPORT_ROLES = ['admin', 'head_teacher']

const ALLOWED_EXPORT_ROLES = ['admin', 'head_teacher', 'subject_teacher']

module.exports = {
  BATCH_SIZE,
  MAX_LIMIT,
  DATA_TOO_LARGE_THRESHOLD,
  VALID_ACTIONS,
  ALLOWED_IMPORT_ROLES,
  ALLOWED_EXPORT_ROLES
}
