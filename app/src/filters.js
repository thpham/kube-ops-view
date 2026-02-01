import * as PIXI from 'pixi.js'
const BRIGHTNESS_FILTER = new PIXI.ColorMatrixFilter()
BRIGHTNESS_FILTER.brightness(1.3)

const DESATURATION_FILTER = new PIXI.ColorMatrixFilter()
DESATURATION_FILTER.desaturate()

export { BRIGHTNESS_FILTER, DESATURATION_FILTER }
