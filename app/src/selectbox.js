import App from './app'
import * as PIXI from 'pixi.js'

export default class SelectBox extends PIXI.Graphics {
  constructor(items, value, onchange) {
    super()
    this.allowChildren = true
    this.items = items
    this.value = value
    this.count = 0
    for (const item of items) {
      if (item.value == value) {
        break
      }
      this.count++
    }
    if (this.count >= items.length) {
      this.count = 0
    }
    this.text = new PIXI.Text({
      text: this.items[this.count].text,
      style: {
        fontFamily: 'ShareTechMono',
        fontSize: 14,
        fill: App.current.theme.primaryColor,
        align: 'center'
      }
    })
    this.text.x = 10
    this.text.y = 5
    this.addChild(this.text)
    this.onchange = onchange
  }

  onForwardOver() {
    this.forwardArrow.alpha = 0.5
  }

  onForwardOut() {
    this.forwardArrow.alpha = 1
  }

  onForwardPressed() {
    const selectBox = this
    selectBox.count++
    if (selectBox.count >= this.items.length) {
      selectBox.count = 0
    }
    selectBox.text.text = selectBox.items[selectBox.count].text
    this.value = this.items[this.count].value
    this.onchange(this.items[this.count].text, this.value)
  }

  onBackOver() {
    this.backArrow.alpha = 0.5
  }

  onBackOut() {
    this.backArrow.alpha = 1
  }

  onBackPressed() {
    const selectBox = this
    selectBox.count--
    if (selectBox.count < 0) {
      selectBox.count = selectBox.items.length - 1
    }
    selectBox.text.text = selectBox.items[selectBox.count].text
    this.value = this.items[this.count].value
    this.onchange(this.items[this.count].text, this.value)
  }

  draw() {
    const selectBox = this

    const backArrow = this.backArrow = new PIXI.Graphics()
    const forwardArrow = this.forwardArrow = new PIXI.Graphics()
    backArrow.interactive = true
    backArrow.cursor = 'pointer'
    forwardArrow.interactive = true
    forwardArrow.cursor = 'pointer'

    // FIXME: hardcoded value for average char width..
    const textBoxWidth = 10 + 8 * Math.max.apply(Math, this.items.map(item => item.text.length))
    const arrowBoxWidth = 18

    // draw back arrow box and triangle
    backArrow.rect(-18, 0, arrowBoxWidth, 22)
    backArrow.fill({ color: App.current.theme.secondaryColor })
    backArrow.moveTo(-4, 5)
    backArrow.lineTo(-15, 11)
    backArrow.lineTo(-4, 17)
    backArrow.lineTo(-4, 5)
    backArrow.fill({ color: App.current.theme.secondaryColor })
    backArrow.stroke({ width: 1, color: App.current.theme.primaryColor })
    selectBox.addChild(backArrow)

    selectBox.rect(4, 0, textBoxWidth, 22)
    selectBox.stroke({ width: 1, color: App.current.theme.primaryColor })

    // draw forward arrow box and triangle
    forwardArrow.rect(textBoxWidth + 8, 0, arrowBoxWidth, 22)
    forwardArrow.fill({ color: App.current.theme.secondaryColor })
    forwardArrow.moveTo(textBoxWidth + 11, 5)
    forwardArrow.lineTo(textBoxWidth + 22, 11)
    forwardArrow.lineTo(textBoxWidth + 11, 17)
    forwardArrow.lineTo(textBoxWidth + 11, 5)
    forwardArrow.fill({ color: App.current.theme.secondaryColor })
    forwardArrow.stroke({ width: 1, color: App.current.theme.primaryColor })
    selectBox.addChild(forwardArrow)

    backArrow.on('mouseover', selectBox.onBackOver.bind(this))
    backArrow.on('mouseout', selectBox.onBackOut.bind(this))
    backArrow.on('mousedown', selectBox.onBackPressed.bind(this))
    backArrow.on('touchstart', selectBox.onBackPressed.bind(this))
    forwardArrow.on('mouseover', selectBox.onForwardOver.bind(this))
    forwardArrow.on('mouseout', selectBox.onForwardOut.bind(this))
    forwardArrow.on('mousedown', selectBox.onForwardPressed.bind(this))
    forwardArrow.on('touchstart', selectBox.onForwardPressed.bind(this))

    return selectBox
  }

}
