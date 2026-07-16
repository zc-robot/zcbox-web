import assert from 'node:assert/strict'
import test from 'node:test'
import { buildParameterSections, filterParameterSections } from './parameterModel.js'

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
