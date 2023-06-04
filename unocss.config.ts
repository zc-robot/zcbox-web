import { defineConfig } from 'unocss'
import presetIcons from '@unocss/preset-icons'
import presetUno from '@unocss/preset-uno'
import presetAttributify from '@unocss/preset-attributify'
import transformerAttributifyJsx from '@unocss/transformer-attributify-jsx'

export default defineConfig({
  preflights: [{
    getCSS: () => `
    html, body, #root {
      height: 100%;
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
        'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
        sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    `,
  }],
  shortcuts: {
    'panel-container': 'bg-dark-300 flex flex-items-center justify-between',
    'panel-item': 'flex hover:bg-dark-800 h-3rem w-2.5rem color-white',
    'panel-item-enabled': 'flex bg-blue h-3rem w-2.5rem color-white',
    'panel-icon': 'text-white text-5 ma',
  },
  presets: [
    presetIcons({
      extraProperties: {
        'display': 'block',
        'vertical-align': 'middle',
      },
    }),
    presetUno(),
    presetAttributify(),
  ],
  transformers: [
    transformerAttributifyJsx(),
  ],
})
