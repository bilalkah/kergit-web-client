import { h, type FunctionalComponent } from 'vue'

type IconProps = { size?: number }

const svgAttrs = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
})

export const IconHeadphones: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', svgAttrs(size), [
    // headband
    h('path', {
      d: 'M21 17V12c0-1.84-.55-3.55-1.5-4.98M3 17V12C3 7.03 7.03 3 12 3c1.44 0 2.8.34 4 0.94',
    }),

    // small top lines
    h('path', { d: 'M22 15.5V17.5' }),
    h('path', { d: 'M2 15.5V17.5' }),

    // left ear
    h('path', {
      d: 'M8 13.84c0-.76 0-1.15-.17-1.41a1.5 1.5 0 0 0-.34-.32c-.27-.16-.64-.12-1.37-.05-1.23.12-1.85.18-2.29.52-.22.17-.41.38-.55.63C3 13.7 3 14.34 3 15.63v1.56c0 1.28 0 1.91.28 2.4.11.18.24.35.39.49.41.38 1.01.5 2.21.73.85.17 1.27.25 1.58.08.12-.06.22-.15.3-.26.22-.29.22-.74.22-1.63v-5.16z',
    }),

    // right ear
    h('path', {
      d: 'M16 13.84c0-.76 0-1.15.17-1.41.09-.13.2-.24.34-.32.27-.16.64-.12 1.37-.05 1.23.12 1.85.18 2.29.52.22.17.41.38.55.63.28.49.28 1.13.28 2.42v1.56c0 1.28 0 1.91-.28 2.4-.11.18-.24.35-.39.49-.41.38-1.01.5-2.21.73-.85.17-1.27.25-1.58.08a1.5 1.5 0 0 1-.3-.26c-.22-.29-.22-.74-.22-1.63v-5.16z',
    }),
  ])

IconHeadphones.props = { size: { type: Number, default: 20 } }

export const IconHeadphonesOff: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', svgAttrs(size), [
    // original headphones (UNCHANGED)

    // headband
    h('path', {
      d: 'M21 17V12c0-1.84-.55-3.55-1.5-4.98M3 17V12C3 7.03 7.03 3 12 3c1.44 0 2.8.34 4 0.94',
    }),

    // small top lines
    h('path', { d: 'M22 15.5V17.5' }),
    h('path', { d: 'M2 15.5V17.5' }),

    // left ear (UNCHANGED)
    h('path', {
      d: 'M8 13.84c0-.76 0-1.15-.17-1.41a1.5 1.5 0 0 0-.34-.32c-.27-.16-.64-.12-1.37-.05-1.23.12-1.85.18-2.29.52-.22.17-.41.38-.55.63C3 13.7 3 14.34 3 15.63v1.56c0 1.28 0 1.91.28 2.4.11.18.24.35.39.49.41.38 1.01.5 2.21.73.85.17 1.27.25 1.58.08.12-.06.22-.15.3-.26.22-.29.22-.74.22-1.63v-5.16z',
    }),

    // right ear (UNCHANGED)
    h('path', {
      d: 'M16 13.84c0-.76 0-1.15.17-1.41.09-.13.2-.24.34-.32.27-.16.64-.12 1.37-.05 1.23.12 1.85.18 2.29.52.22.17.41.38.55.63.28.49.28 1.13.28 2.42v1.56c0 1.28 0 1.91-.28 2.4-.11.18-.24.35-.39.49-.41.38-1.01.5-2.21.73-.85.17-1.27.25-1.58.08a1.5 1.5 0 0 1-.3-.26c-.22-.29-.22-.74-.22-1.63v-5.16z',
    }),

    // slash (ONLY addition)
    h('line', { x1: 1, y1: 1, x2: 23, y2: 23 }),
  ])

IconHeadphonesOff.props = { size: { type: Number, default: 20 } }

export const IconMic: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', svgAttrs(size), [
    h('path', { d: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' }),
    h('path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }),
    h('line', { x1: 12, y1: 19, x2: 12, y2: 23 }),
    h('line', { x1: 8, y1: 23, x2: 16, y2: 23 }),
  ])
IconMic.props = { size: { type: Number, default: 20 } }

export const IconMicMuted: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', svgAttrs(size), [
    h('line', { x1: 1, y1: 1, x2: 23, y2: 23 }),
    h('path', { d: 'M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6' }),
    h('path', { d: 'M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .74-.11 1.46-.33 2.13' }),
    h('line', { x1: 12, y1: 19, x2: 12, y2: 23 }),
    h('line', { x1: 8, y1: 23, x2: 16, y2: 23 }),
  ])
IconMicMuted.props = { size: { type: Number, default: 20 } }

export const IconCamera: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', svgAttrs(size), [
    h('path', { d: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z' }),
    h('circle', { cx: 12, cy: 13, r: 4 }),
  ])
IconCamera.props = { size: { type: Number, default: 20 } }

export const IconCameraOff: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', svgAttrs(size), [
    h('line', { x1: 1, y1: 1, x2: 23, y2: 23 }),
    h('path', { d: 'M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34' }),
  ])
IconCameraOff.props = { size: { type: Number, default: 20 } }

export const IconScreenShare: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', svgAttrs(size), [
    h('rect', { x: 2, y: 3, width: 20, height: 14, rx: 2, ry: 2 }),
    h('line', { x1: 8, y1: 21, x2: 16, y2: 21 }),
    h('line', { x1: 12, y1: 17, x2: 12, y2: 21 }),
  ])
IconScreenShare.props = { size: { type: Number, default: 20 } }

export const IconScreenShareOff: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', svgAttrs(size), [
    h('line', { x1: 1, y1: 1, x2: 23, y2: 23 }),
    h('path', { d: 'M17 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v7' }),
    h('line', { x1: 8, y1: 21, x2: 16, y2: 21 }),
    h('line', { x1: 12, y1: 17, x2: 12, y2: 21 }),
  ])
IconScreenShareOff.props = { size: { type: Number, default: 20 } }

export const IconDisconnect: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', svgAttrs(size), [
    h('path', { d: 'M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91' }),
    h('line', { x1: 23, y1: 1, x2: 1, y2: 23 }),
  ])
IconDisconnect.props = { size: { type: Number, default: 20 } }

export const IconFullscreen: FunctionalComponent<IconProps> = ({ size = 18 }) =>
  h('svg', svgAttrs(size), [
    h('polyline', { points: '15 3 21 3 21 9' }),
    h('polyline', { points: '9 21 3 21 3 15' }),
    h('line', { x1: 21, y1: 3, x2: 14, y2: 10 }),
    h('line', { x1: 3, y1: 21, x2: 10, y2: 14 }),
  ])
IconFullscreen.props = { size: { type: Number, default: 18 } }

export const IconFullscreenExit: FunctionalComponent<IconProps> = ({ size = 18 }) =>
  h('svg', svgAttrs(size), [
    h('polyline', { points: '4 14 10 14 10 20' }),
    h('polyline', { points: '20 10 14 10 14 4' }),
    h('line', { x1: 14, y1: 10, x2: 21, y2: 3 }),
    h('line', { x1: 3, y1: 21, x2: 10, y2: 14 }),
  ])
IconFullscreenExit.props = { size: { type: Number, default: 18 } }

export const IconDots: FunctionalComponent<IconProps> = ({ size = 16 }) =>
  h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor' }, [
    h('circle', { cx: 12, cy: 5, r: 2 }),
    h('circle', { cx: 12, cy: 12, r: 2 }),
    h('circle', { cx: 12, cy: 19, r: 2 }),
  ])
IconDots.props = { size: { type: Number, default: 16 } }

const filledSvgAttrs = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  'aria-hidden': 'true',
})

export const IconVolumeBoosted: FunctionalComponent<IconProps> = ({ size = 14 }) =>
  h('svg', filledSvgAttrs(size), [
    h('path', { d: 'M4 10v4h4l5 4V6L8 10H4z', fill: 'currentColor' }),
    h('path', { d: 'M16 8v8M12 12h8', fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-width': 1.8 }),
  ])
IconVolumeBoosted.props = { size: { type: Number, default: 14 } }

export const IconVolumeLow: FunctionalComponent<IconProps> = ({ size = 14 }) =>
  h('svg', filledSvgAttrs(size), [
    h('path', { d: 'M4 10v4h4l5 4V6L8 10H4z', fill: 'currentColor' }),
    h('path', { d: 'M16 10a3 3 0 0 1 0 4', fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-width': 1.8 }),
  ])
IconVolumeLow.props = { size: { type: Number, default: 14 } }

export const IconVolumeMuted: FunctionalComponent<IconProps> = ({ size = 14 }) =>
  h('svg', filledSvgAttrs(size), [
    h('path', { d: 'M4 10v4h4l5 4V6L8 10H4z', fill: 'currentColor' }),
    h('path', { d: 'M16 8l4 8M20 8l-4 8', fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-width': 1.8 }),
  ])
IconVolumeMuted.props = { size: { type: Number, default: 14 } }

export const IconPhoneOff: FunctionalComponent<IconProps> = ({ size = 20 }) =>
  h('svg', svgAttrs(size), [
    h('path', {
      d: 'M20 4L16 8M16 4L20 8',
    }),
    h('path', {
      d: 'M4.01 7.93c-.07 1.91.41 5.15 3.66 8.4.78.78 1.57 1.41 2.33 1.9M5.54 4.94c1.39-1.39 3.61-1.21 4.5.38l.65 1.16c.58 1.05.34 2.43-.59 3.35 0 0 0 0 0 0 0 0-1.12 1.12.91 3.15 2.03 2.03 3.15.91 3.15.91 0 0 0 0 0 0 .92-.92 2.3-1.16 3.35-.59l1.16.65c1.59.89 1.77 3.11.38 4.5-.84.84-1.87 1.49-3 1.53-.81.03-1.87-.04-3.06-.38',
    }),
  ])

IconPhoneOff.props = { size: { type: Number, default: 20 } }