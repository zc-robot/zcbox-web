const assert = require('node:assert/strict')
const test = require('node:test')
const { serializeRobotParameterUpdateBody } = require('./robot-parameter-request.cjs')

test('a ROS double with an integer value is sent as a JSON double token', () => {
  const body = serializeRobotParameterUpdateBody({
    keyPath: 'openplc_modbus_node.ros__parameters.read_hz',
    newValue: 20,
    numericType: 'double',
  })

  assert.match(body, /"new_value":20\.0(?:[,}])/)
  assert.equal(JSON.parse(body).new_value, 20)
})

test('a ROS integer is sent as a JSON integer token', () => {
  const body = serializeRobotParameterUpdateBody({
    keyPath: 'openplc_modbus_node.ros__parameters.retry_count',
    newValue: 20,
    numericType: 'integer',
  })

  assert.match(body, /"new_value":20(?:[,}])/)
  assert.doesNotMatch(body, /"new_value":20\.0(?:[,}])/)
})
