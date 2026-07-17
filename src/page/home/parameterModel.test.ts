import assert from 'node:assert/strict'
import test from 'node:test'
import { buildParameterSections, filterParameterSections, updateParameterValue } from './parameterModel.js'

test('robot parameters are grouped by their top-level YAML section', () => {
  const sections = buildParameterSections([
    'navigation:',
    '  controller:',
    '    max_speed: 1.25',
    '    enabled: true',
    'hardware:',
    '  lidar_model: mid360',
  ].join('\n'))

  assert.deepEqual(sections.map(section => ({
    key: section.key,
    count: section.parameters.length,
    paths: section.parameters.map(parameter => parameter.path),
  })), [
    {
      key: 'navigation',
      count: 2,
      paths: [
        'navigation.controller.max_speed',
        'navigation.controller.enabled',
      ],
    },
    {
      key: 'hardware',
      count: 1,
      paths: ['hardware.lidar_model'],
    },
  ])
})

test('robot parameters preserve top-level keys that resemble an API response', () => {
  const sections = buildParameterSections(JSON.stringify({
    code: 42,
    data: {
      robot: {
        model: 'forklift',
      },
    },
    message: 'configured',
  }))

  assert.deepEqual(sections.map(section => ({
    key: section.key,
    paths: section.parameters.map(parameter => parameter.path),
  })), [
    {
      key: 'general',
      paths: ['code', 'message'],
    },
    {
      key: 'data',
      paths: ['data.robot.model'],
    },
  ])
})

test('robot parameters can be searched by friendly label, original path, or value', () => {
  const sections = buildParameterSections([
    'motion_control:',
    '  max_linear_speed: 1.25',
    '  driver: roboteq',
    'sensors:',
    '  lidar_model: mid360',
  ].join('\n'))

  assert.deepEqual(
    filterParameterSections(sections, 'linear speed').flatMap(section => section.parameters.map(parameter => parameter.path)),
    ['motion_control.max_linear_speed'],
  )
  assert.deepEqual(
    filterParameterSections(sections, 'SENSORS.LIDAR').flatMap(section => section.parameters.map(parameter => parameter.path)),
    ['sensors.lidar_model'],
  )
  assert.deepEqual(
    filterParameterSections(sections, 'roboteq').flatMap(section => section.parameters.map(parameter => parameter.path)),
    ['motion_control.driver'],
  )
})

test('a nested robot parameter value can be updated locally after saving', () => {
  const source = [
    'amcl:',
    '  ros__parameters:',
    '    alpha1: 0.05',
    '    enabled: true',
  ].join('\n')

  const updated = updateParameterValue(source, 'amcl.ros__parameters.alpha1', 0.1)
  const sections = buildParameterSections(updated)

  assert.equal(
    sections[0].parameters.find(parameter => parameter.path === 'amcl.ros__parameters.alpha1')?.value,
    0.1,
  )
})

test('robot parameter arrays retain their value type after an update', () => {
  const updated = updateParameterValue(
    'controller:\n  plugins:\n    - FollowPath\n',
    'controller.plugins',
    ['FollowPath', 'Docking'],
  )

  assert.deepEqual(buildParameterSections(updated)[0].parameters[0].value, ['FollowPath', 'Docking'])
})

test('updating an unknown robot parameter path fails before changing local state', () => {
  assert.throws(
    () => updateParameterValue('amcl:\n  enabled: true\n', 'amcl.missing', false),
    /path was not found/,
  )
})

test('parameter paths retain YAML keys that contain literal dots', () => {
  const source = [
    'wheel_motor_server:',
    '  ros__parameters:',
    '    drive_motors.tpdo1_response_topics:',
    '      - /wheel_motor/tpdo1',
  ].join('\n')
  const parameter = buildParameterSections(source)[0].parameters[0]

  assert.equal(
    parameter.path,
    'wheel_motor_server.ros__parameters.drive_motors.tpdo1_response_topics',
  )
  assert.deepEqual(parameter.pathSegments, [
    'wheel_motor_server',
    'ros__parameters',
    'drive_motors.tpdo1_response_topics',
  ])

  const updated = updateParameterValue(source, parameter.pathSegments, ['/wheel_motor/tpdo1_updated'])
  assert.deepEqual(buildParameterSections(updated)[0].parameters[0].value, ['/wheel_motor/tpdo1_updated'])
})

test('integer-valued ROS doubles stay distinct from ROS integers', () => {
  const parameters = buildParameterSections(
    '{"openplc_modbus_node":{"ros__parameters":{"read_hz":10.0,"retry_count":10}}}',
  )[0].parameters

  assert.equal(parameters.find(parameter => parameter.key === 'read_hz')?.numericType, 'double')
  assert.equal(parameters.find(parameter => parameter.key === 'retry_count')?.numericType, 'integer')
})

test('local updates preserve the original ROS numeric type token', () => {
  const source = '{"openplc_modbus_node":{"ros__parameters":{"read_hz":10.0,"retry_count":10}}}'

  const updatedDouble = updateParameterValue(
    source,
    ['openplc_modbus_node', 'ros__parameters', 'read_hz'],
    20,
    'double',
  )
  const updatedInteger = updateParameterValue(
    updatedDouble,
    ['openplc_modbus_node', 'ros__parameters', 'retry_count'],
    20,
    'integer',
  )

  assert.match(updatedInteger, /"?read_hz"?: 20\.0/)
  assert.match(updatedInteger, /"?retry_count"?: 20(?:[\s,}]|$)/)
  assert.doesNotMatch(updatedInteger, /"?retry_count"?: 20\.0/)
})
