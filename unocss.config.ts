import { defineConfig } from 'unocss'
import presetIcons from '@unocss/preset-icons'
import presetUno from '@unocss/preset-uno'
import presetAttributify from '@unocss/preset-attributify'
import transformerAttributifyJsx from '@unocss/transformer-attributify-jsx'

export default defineConfig({
  shortcuts: {
    "panel-container": "bg-dark-300 flex flex-items-center justify-between",
    "panel-item": "flex hover:bg-dark-800 h-3rem w-2.5rem color-white",
    "panel-item-enabled": "flex bg-blue h-3rem w-2.5rem color-white",
    "panel-icon": "text-white text-5 ma",
  },
  presets: [
    presetIcons(),
    presetUno(),
    presetAttributify(),
  ],
  transformers: [
    transformerAttributifyJsx(),
  ]
})
