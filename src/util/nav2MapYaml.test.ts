import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAlignedNav2MapYaml } from './nav2MapYaml.js'

test('aligned Nav2 map YAML copies reference settings and recalculates origin from image height', () => {
  const yaml = buildAlignedNav2MapYaml({
    referenceYaml: [
      'image: old.png',
      'mode: trinary',
      'resolution: 0.05',
      'origin: [12.5, 9.5, 1.57]',
      'negate: 0',
      'occupied_thresh: 0.65',
      'free_thresh: 0.25',
    ].join('\n'),
    imageFilename: 'aligned.png',
    imageHeight: 200,
  })

  assert.equal(yaml, [
    'image: aligned.png',
    'mode: trinary',
    'resolution: 0.05',
    'origin: [0, -10, 0]',
    'negate: 0',
    'occupied_thresh: 0.65',
    'free_thresh: 0.25',
    '',
  ].join('\n'))
})

test('aligned Nav2 map YAML uses fallback resolution when reference omits it', () => {
  const yaml = buildAlignedNav2MapYaml({
    referenceYaml: [
      'image: old.png',
      'negate: 0',
      'occupied_thresh: 0.65',
      'free_thresh: 0.25',
    ].join('\n'),
    imageFilename: 'aligned.png',
    imageHeight: 80,
    fallbackResolution: 0.1,
  })

  assert.match(yaml, /resolution: 0.1/)
  assert.match(yaml, /origin: \[0, -8, 0\]/)
})
