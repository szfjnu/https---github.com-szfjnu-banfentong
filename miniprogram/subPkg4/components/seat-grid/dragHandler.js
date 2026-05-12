var LONG_PRESS_DURATION = 500
var DRAG_FLOAT_SIZE = 50

var _dragState = {
  isPressed: false,
  pressStartTime: 0,
  sourceRow: 0,
  sourceCol: 0,
  sourceKey: '',
  startX: 0,
  startY: 0,
  isDragging: false,
  currentX: 0,
  currentY: 0
}

function onTouchStart(event, component) {
  if (!component.data.enableDrag) return

  var touch = event.touches[0]
  if (!touch) return

  var dataset = event.currentTarget.dataset
  _dragState.isPressed = true
  _dragState.pressStartTime = Date.now()
  _dragState.sourceRow = dataset.row || 0
  _dragState.sourceCol = dataset.col || 0
  _dragState.sourceKey = (dataset.row || 0) + '_' + (dataset.col || 0)
  _dragState.startX = touch.clientX
  _dragState.startY = touch.clientY
  _dragState.isDragging = false
}

function onTouchMove(event, component) {
  if (!component.data.enableDrag) return

  if (!_dragState.isPressed) return

  var touch = event.touches[0]
  if (!touch) return

  var elapsed = Date.now() - _dragState.pressStartTime

  if (!_dragState.isDragging && elapsed >= LONG_PRESS_DURATION) {
    _dragState.isDragging = true
    component.onDragStartByWXS({
      sourceKey: _dragState.sourceKey,
      sourceRow: _dragState.sourceRow,
      sourceCol: _dragState.sourceCol
    })
  }

  if (_dragState.isDragging) {
    _dragState.currentX = touch.clientX
    _dragState.currentY = touch.clientY

    var floatX = touch.clientX - DRAG_FLOAT_SIZE
    var floatY = touch.clientY - DRAG_FLOAT_SIZE

    component.onDragMoveByWXS({
      clientX: touch.clientX,
      clientY: touch.clientY,
      floatX: floatX,
      floatY: floatY
    })
  }
}

function onTouchEnd(event, component) {
  if (!component.data.enableDrag) return

  if (_dragState.isDragging) {
    var touch = event.changedTouches[0]
    component.onDragEndByWXS({
      clientX: touch ? touch.clientX : _dragState.currentX,
      clientY: touch ? touch.clientY : _dragState.currentY
    })
  }

  _dragState.isPressed = false
  _dragState.isDragging = false
  _dragState.sourceKey = ''
}

function onTouchCancel(event, component) {
  if (!component.data.enableDrag) return

  if (_dragState.isDragging) {
    component.onDragCancelByWXS({})
  }

  _dragState.isPressed = false
  _dragState.isDragging = false
  _dragState.sourceKey = ''
}

module.exports = {
  onTouchStart: onTouchStart,
  onTouchMove: onTouchMove,
  onTouchEnd: onTouchEnd,
  onTouchCancel: onTouchCancel
}
