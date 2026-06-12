import { h, type FunctionalComponent } from 'vue'

type IconProps = { size?: number }

export const IconSettings: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 512 512',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }, [
    h('path', {
      d: 'M262.29,192.31a64,64,0,1,0,57.4,57.4A64.13,64.13,0,0,0,262.29,192.31ZM416.39,256a154.34,154.34,0,0,1-1.53,20.79l45.21,35.46A10.81,10.81,0,0,1,462.52,326l-42.77,74a10.81,10.81,0,0,1-13.14,4.59l-44.9-18.08a16.11,16.11,0,0,0-15.17,1.75A164.48,164.48,0,0,1,325,400.8a15.94,15.94,0,0,0-8.82,12.14l-6.73,47.89A11.08,11.08,0,0,1,298.77,470H213.23a11.11,11.11,0,0,1-10.69-8.87l-6.72-47.82a16.07,16.07,0,0,0-9-12.22,155.3,155.3,0,0,1-21.46-12.57,16,16,0,0,0-15.11-1.71l-44.89,18.07a10.81,10.81,0,0,1-13.14-4.58l-42.77-74a10.8,10.8,0,0,1,2.45-13.75l38.21-30a16.05,16.05,0,0,0,6-14.08c-.36-4.17-.58-8.33-.58-12.5s.21-8.27.58-12.35a16,16,0,0,0-6.07-13.94l-38.19-30A10.81,10.81,0,0,1,49.48,186l42.77-74a10.81,10.81,0,0,1,13.14-4.59l44.9,18.08a16.11,16.11,0,0,0,15.17-1.75A164.48,164.48,0,0,1,187,111.2a15.94,15.94,0,0,0,8.82-12.14l6.73-47.89A11.08,11.08,0,0,1,213.23,42h85.54a11.11,11.11,0,0,1,10.69,8.87l6.72,47.82a16.07,16.07,0,0,0,9,12.22,155.3,155.3,0,0,1,21.46,12.57,16,16,0,0,0,15.11,1.71l44.89-18.07a10.81,10.81,0,0,1,13.14,4.58l42.77,74a10.8,10.8,0,0,1-2.45,13.75l-38.21,30a16.05,16.05,0,0,0-6.05,14.08C416.17,247.67,416.39,251.83,416.39,256Z',
      'stroke-width': 32,
    }),
  ])

IconSettings.props = { size: { type: Number, default: 20 } }

export const IconClose: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
  }, [
    h('line', { x1: 5, y1: 5, x2: 19, y2: 19 }),
    h('line', { x1: 19, y1: 5, x2: 5, y2: 19 }),
  ])

IconClose.props = { size: { type: Number, default: 20 } }

export const IconTextChannel: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-linecap': 'round',
    'stroke-width': 1.8,
  }, [
    h('path', { d: 'M5 7h14M5 12h10M5 17h8' }),
  ])

IconTextChannel.props = { size: { type: Number, default: 20 } }

export const IconVoiceChannel: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.8,
  }, [
    h('path', { d: 'M4 10v4h4l5 4V6L8 10H4Z', 'stroke-linejoin': 'round' }),
    h('path', { d: 'M16 9a4 4 0 0 1 0 6', 'stroke-linecap': 'round' }),
    h('path', { d: 'M19 7a7 7 0 0 1 0 10', 'stroke-linecap': 'round' }),
  ])

IconVoiceChannel.props = { size: { type: Number, default: 20 } }