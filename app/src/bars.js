import { FACTORS, getBarColor } from './utils'
import App from './app'
import * as PIXI from 'pixi.js'

export default class Bars extends PIXI.Graphics {
  constructor(entity, resources, tooltip) {
    super()
    this.entity = entity
    this.resources = resources
    this.tooltip = tooltip
  }

  draw() {
    const bars = this

    const barHeightPx = bars.entity.heightOfNodePx - (App.current.heightOfTopHandlePx + 5 + 3)
    const heightOfNodeWoPaddingPx = bars.entity.heightOfNodePx - 5

    // Background bar
    bars.rect(5, heightOfNodeWoPaddingPx - barHeightPx, 15, barHeightPx)
    bars.fill({ color: App.current.theme.primaryColor, alpha: 0.1 })

    // CPU
    const cpuHeight = barHeightPx / bars.resources.cpu.capacity
    bars.interactive = true

    // CPU requested bar
    bars.rect(5, heightOfNodeWoPaddingPx - (bars.resources.cpu.requested + bars.resources.cpu.reserved) * cpuHeight, 2.5, (bars.resources.cpu.requested + bars.resources.cpu.reserved) * cpuHeight)
    bars.fill({ color: getBarColor(bars.resources.cpu.requested, bars.resources.cpu.capacity - bars.resources.cpu.reserved) })

    // CPU used bar
    bars.rect(7.5, heightOfNodeWoPaddingPx - bars.resources.cpu.used * cpuHeight, 2.5, bars.resources.cpu.used * cpuHeight)
    bars.fill({ color: getBarColor(bars.resources.cpu.used, bars.resources.cpu.capacity) })

    // CPU reserved outline
    bars.rect(5, heightOfNodeWoPaddingPx - bars.resources.cpu.reserved * cpuHeight, 5, bars.resources.cpu.reserved * cpuHeight)
    bars.stroke({ width: 1, color: App.current.theme.primaryColor })

    // Memory
    const scale = bars.resources.memory.capacity / barHeightPx

    // Memory requested bar
    bars.rect(14, heightOfNodeWoPaddingPx - (bars.resources.memory.requested + bars.resources.memory.reserved) / scale, 2.5, (bars.resources.memory.requested + bars.resources.memory.reserved) / scale)
    bars.fill({ color: getBarColor(bars.resources.memory.requested, bars.resources.memory.capacity - bars.resources.memory.reserved) })

    // Memory used bar
    bars.rect(16.5, heightOfNodeWoPaddingPx - bars.resources.memory.used / scale, 2.5, bars.resources.memory.used / scale)
    bars.fill({ color: getBarColor(bars.resources.memory.used, bars.resources.memory.capacity) })

    // Memory reserved outline
    bars.rect(14, heightOfNodeWoPaddingPx - bars.resources.memory.reserved / scale, 5, bars.resources.memory.reserved / scale)
    bars.stroke({ width: 1, color: App.current.theme.primaryColor })

    // CPU capacity grid
    for (var i = 0; i < bars.resources.cpu.capacity; i++) {
      bars.rect(5, heightOfNodeWoPaddingPx - (i + 1) * cpuHeight, 5, cpuHeight)
      bars.stroke({ width: 1, color: App.current.theme.primaryColor })
    }

    // Memory capacity outline
    bars.rect(14, heightOfNodeWoPaddingPx - bars.resources.memory.capacity / scale, 5, bars.resources.memory.capacity / scale)
    bars.stroke({ width: 1, color: App.current.theme.primaryColor })

    bars.on('mouseover', function () {
      let s = 'CPU: \n'
      const { capacity: cpuCap, reserved: cpuRes, requested: cpuReq, used: cpuUsed } = bars.resources.cpu
      s += '\t\t Capacity  : ' + cpuCap + '\n'
      s += '\t\t Reserved  : ' + cpuRes.toFixed(2) + '\n'
      s += '\t\t Requested : ' + cpuReq.toFixed(2) + '\n'
      s += '\t\t Used      : ' + cpuUsed.toFixed(2) + '\n'
      s += '\nMemory: \n'

      const { capacity: memCap, reserved: memRes, requested: memReq, used: memUsed } = bars.resources.memory
      s += '\t\t Capacity  : ' + (memCap / FACTORS.Gi).toFixed(2) + ' GiB\n'
      s += '\t\t Reserved  : ' + (memRes / FACTORS.Gi).toFixed(2) + ' GiB\n'
      s += '\t\t Requested : ' + (memReq / FACTORS.Gi).toFixed(2) + ' GiB\n'
      s += '\t\t Used      : ' + (memUsed / FACTORS.Gi).toFixed(2) + ' GiB\n'

      s += '\nPods: \n'
      const { capacity: podsCap, used: podsUsed } = bars.resources.pods
      s += '\t\t Capacity  : ' + podsCap + '\n'
      s += '\t\t Used      : ' + podsUsed + '\n'

      bars.tooltip.setText(s)
      bars.tooltip.position = bars.toGlobal(new PIXI.Point(22, 16))
      bars.tooltip.visible = true
    })
    bars.on('mouseout', function () {
      bars.tooltip.visible = false
    })

    return bars
  }

}
