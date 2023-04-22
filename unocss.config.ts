import { defineConfig } from 'unocss'
import presetUno from '@unocss/preset-uno'
import presetAttributify from '@unocss/preset-attributify'
import transformerAttributifyJsx from '@unocss/transformer-attributify-jsx'

export default defineConfig({
  shortcuts: {
    'header-link': 'bg-lime600 color-white p-3 no-underline font-sans',
  },
  presets: [
    presetUno(),
    presetAttributify(),
  ],
  transformers: [
    transformerAttributifyJsx(),
  ]
})
