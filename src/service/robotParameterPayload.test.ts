import assert from 'node:assert/strict'
import test from 'node:test'
import { extractLatestRobotParameterYaml, normalizeRobotParametersByHeads, parseRobotParameterHeads, serializeRobotParameterUpdateBody } from './robotParameterPayload.js'

test('raw YAML parameter responses are preserved', () => {
  const source = 'navigation:\n  max_speed: 1.25\n'
  assert.equal(extractLatestRobotParameterYaml(source), source)
})

test('the newest YAML record is extracted from yamlGetAll JSON', () => {
  const source = JSON.stringify([
    { id: 2, content: 'navigation:\n  max_speed: 1.0\n' },
    { id: 7, content: 'navigation:\n  max_speed: 1.5\n' },
    { id: 3, content: 'navigation:\n  max_speed: 1.2\n' },
  ])

  assert.equal(
    extractLatestRobotParameterYaml(source),
    'navigation:\n  max_speed: 1.5\n',
  )
})

test('a JSON data envelope containing YAML records is supported', () => {
  const source = JSON.stringify({
    data: [
      { id: '10', content: 'hardware:\n  lidar: mid360\n' },
      { id: '11', content: 'hardware:\n  lidar: lslidar\n' },
    ],
  })

  assert.equal(
    extractLatestRobotParameterYaml(source),
    'hardware:\n  lidar: lslidar\n',
  )
})

test('an actual HTML login response is rejected without trusting its content type', () => {
  assert.throws(
    () => extractLatestRobotParameterYaml('<!doctype html><html><body>Login</body></html>'),
    /web page instead of parameter data/,
  )
})

test('record arrays without YAML content are rejected', () => {
  assert.throws(
    () => extractLatestRobotParameterYaml(JSON.stringify([{ id: 1 }])),
    /without YAML content/,
  )
})

test('parameter heads are parsed from the live array response shape', () => {
  assert.deepEqual(
    parseRobotParameterHeads(JSON.stringify(['amcl', 'battery_interface', 'amcl'])),
    ['amcl', 'battery_interface'],
  )
})

test('parameters by head preserve the requested nested object', () => {
  const normalized = normalizeRobotParametersByHeads(JSON.stringify({
    amcl: {
      ros__parameters: {
        alpha1: 0.05,
      },
    },
  }), ['amcl'])

  assert.deepEqual(JSON.parse(normalized), {
    amcl: {
      ros__parameters: {
        alpha1: 0.05,
      },
    },
  })
})

test('parameters by head preserve JSON double tokens that have an integer value', () => {
  const source = '{"openplc_modbus_node":{"ros__parameters":{"read_hz":10.0,"retry_count":10}}}'

  assert.equal(
    normalizeRobotParametersByHeads(source, ['openplc_modbus_node']),
    source,
  )
})

test('browser updates preserve ROS double and integer JSON number tokens', () => {
  assert.match(
    serializeRobotParameterUpdateBody('openplc_modbus_node.ros__parameters.read_hz', 20, 'double'),
    /"new_value":20\.0(?:[,}])/,
  )
  assert.match(
    serializeRobotParameterUpdateBody('openplc_modbus_node.ros__parameters.retry_count', 20, 'integer'),
    /"new_value":20(?:[,}])/,
  )
})

test('parameters by head reject a response missing the requested head', () => {
  assert.throws(
    () => normalizeRobotParametersByHeads(JSON.stringify({ amcl: {} }), ['wheel_motor_server']),
    /did not return parameter head/,
  )
})
