import App from './app.js'
import * as PIXI from 'pixi.js'

export default class Tooltip extends PIXI.Graphics {
  constructor() {
    super()
    this.allowChildren = true
    this.text = new PIXI.Text({ text: '', style: { fontFamily: 'ShareTechMono', fontSize: 12, fill: 0xffffff } })
    this.text.x = 4
    this.text.y = 4
    this.addChild(this.text)
    this.visible = false
  }

  setText(text) {
    this.text.text = text
    this.draw()
  }

  draw() {
    this.clear()
    this.rect(0, 0, this.text.width + 8, this.text.height + 8)
    this.fill({ color: App.current.theme.secondaryColor, alpha: 0.8 })
    this.stroke({ width: 2, color: App.current.theme.secondaryColor, alpha: 0.8 })
  }
}
