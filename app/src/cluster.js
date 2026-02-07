import { Node, getNodePoolType, getPoolColor, getNodeAZ, POOL_PRIORITY } from './node.js'
import { Pod } from './pod.js'
import App from './app.js'
import * as PIXI from 'pixi.js'

export default class Cluster extends PIXI.Graphics {
  constructor(cluster, status, tooltip, config) {
    super()
    this.allowChildren = true
    this.cluster = cluster
    this.status = status
    this.tooltip = tooltip
    this.config = config
  }

  destroy() {
    if (this.tick) {
      PIXI.Ticker.shared.remove(this.tick, this)
    }
    super.destroy()
  }

  pulsate(_time) {
    const v = Math.sin((PIXI.Ticker.shared.lastTime % 1000) / 1000. * Math.PI)
    this.alpha = 0.4 + (v * 0.6)
  }

  /**
   * Groups nodes by their pool type and AZ, and calculates sizing for each pool
   * @returns {Object} - Object with pool names as keys, containing AZ groups and sizing info
   */
  groupNodesByPool() {
    const pools = {}

    // First pass: group nodes by pool type and AZ, find max pods per pool
    for (const node of Object.values(this.cluster.nodes)) {
      const poolType = getNodePoolType(node.labels)
      const az = getNodeAZ(node.labels)

      if (!pools[poolType]) {
        pools[poolType] = {
          azGroups: {},  // Group nodes by AZ within the pool
          maxPods: 0,
          podsPerRow: 0,
          widthPx: 0,
          heightPx: 0,
          color: getPoolColor(poolType)
        }
      }

      // Group by AZ within the pool
      if (!pools[poolType].azGroups[az]) {
        pools[poolType].azGroups[az] = []
      }
      pools[poolType].azGroups[az].push(node)

      const podsInNode = Object.values(node.pods).length
      if (podsInNode > pools[poolType].maxPods) {
        pools[poolType].maxPods = podsInNode
      }
    }

    // Second pass: calculate sizing for each pool and sort nodes within AZ groups
    for (const poolType in pools) {
      const pool = pools[poolType]

      pool.podsPerRow = Math.max(
        App.current.defaultPodsPerRow,
        Math.ceil(Math.sqrt(pool.maxPods))
      )

      pool.widthPx = Math.max(
        App.current.defaultWidthOfNodePx,
        Math.floor(pool.podsPerRow * App.current.sizeOfPodPx + App.current.startDrawingPodsAt + 2)
      )

      pool.heightPx = Math.max(
        App.current.defaultHeightOfNodePx,
        Math.floor(pool.podsPerRow * App.current.sizeOfPodPx + App.current.heightOfTopHandlePx + (App.current.sizeOfPodPx * 2) + 2)
      )

      // Sort nodes within each AZ group by name
      for (const az in pool.azGroups) {
        pool.azGroups[az].sort((a, b) => a.name.localeCompare(b.name))
      }

      // Store sorted AZ names for consistent rendering
      pool.sortedAZs = Object.keys(pool.azGroups).sort()
    }

    return pools
  }

  /**
   * Sorts pool types by priority (master first, then infra, then workers)
   * @param {string[]} poolTypes - Array of pool type names
   * @returns {string[]} - Sorted array
   */
  sortPoolTypes(poolTypes) {
    return poolTypes.sort((a, b) => {
      const priorityA = a in POOL_PRIORITY ? POOL_PRIORITY[a] : POOL_PRIORITY['default']
      const priorityB = b in POOL_PRIORITY ? POOL_PRIORITY[b] : POOL_PRIORITY['default']
      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }
      // Same priority, sort alphabetically
      return a.localeCompare(b)
    })
  }

  draw() {
    this.removeChildren()
    this.clear()

    const left = 10
    const top = 20
    const padding = 5
    const poolHeaderHeight = 16  // Height for pool type label row
    const azHeaderHeight = 14    // Height for AZ label
    const azColumnPadding = 8    // Extra padding between AZ columns
    const nodesPerRowInAZ = 3    // Max nodes per row within an AZ before wrapping

    // Group nodes by pool type and AZ
    const pools = this.groupNodesByPool()
    const sortedPoolTypes = this.sortPoolTypes(Object.keys(pools))

    let currentY = top
    let overallMaxX = left
    const poolHeaders = []
    const azHeaders = []

    // Render each pool as a separate row
    for (const poolType of sortedPoolTypes) {
      const pool = pools[poolType]
      const poolColor = pool.color
      const sortedAZs = pool.sortedAZs

      // Count total nodes in this pool
      let totalNodesInPool = 0
      for (const az of sortedAZs) {
        totalNodesInPool += pool.azGroups[az].length
      }

      // Add pool header/label (rect drawn later with correct width)
      const poolHeader = new PIXI.Graphics()
      poolHeader.allowChildren = true

      const poolLabel = new PIXI.Text({
        text: `${poolType.toUpperCase()} (${totalNodesInPool})`,
        style: { fontFamily: 'ShareTechMono', fontSize: 10, fill: 0xffffff }
      })
      poolLabel.x = 4
      poolLabel.y = 2
      poolHeader.addChild(poolLabel)
      poolHeader.y = currentY
      poolHeader.x = left
      poolHeaders.push({ header: poolHeader, color: poolColor })

      currentY += poolHeaderHeight + 2

      // Check if we have multiple AZs (show AZ headers only if more than one)
      const showAZHeaders = sortedAZs.length > 1 || (sortedAZs.length === 1 && sortedAZs[0] !== 'unknown')

      if (showAZHeaders) {
        currentY += azHeaderHeight + 2
      }

      // Track pool dimensions
      const poolStartY = currentY
      let poolMaxHeight = 0
      let azStartX = left

      // Render each AZ as a column within the pool row
      for (const az of sortedAZs) {
        const nodesInAZ = pool.azGroups[az]

        // Calculate grid dimensions for this AZ
        const azCols = Math.min(nodesPerRowInAZ, nodesInAZ.length)
        const azRows = Math.ceil(nodesInAZ.length / nodesPerRowInAZ)
        const azWidthPx = azCols * (pool.widthPx + padding) - padding

        // Add AZ header if showing
        if (showAZHeaders) {
          const azHeader = new PIXI.Graphics()
          azHeader.allowChildren = true
          // Offset by -1 and widen by +2 to align with node 2px stroke (extends 1px outward each side)
          azHeader.rect(-1, 0, azWidthPx + 2, azHeaderHeight)
          azHeader.fill({ color: poolColor, alpha: 0.15 })
          azHeader.stroke({ width: 1, color: poolColor, alpha: 0.4 })

          // Truncate AZ name if too long
          const maxAZChars = Math.floor(azWidthPx / 6)
          const displayAZ = az.length > maxAZChars ? az.substring(az.length - maxAZChars) : az

          const azLabel = new PIXI.Text({
            text: `${displayAZ} (${nodesInAZ.length})`,
            style: { fontFamily: 'ShareTechMono', fontSize: 9, fill: 0xcccccc }
          })
          azLabel.x = 3
          azLabel.y = 1
          azHeader.addChild(azLabel)
          azHeader.x = azStartX
          azHeader.y = poolStartY - azHeaderHeight - 2
          azHeaders.push(azHeader)
        }

        // Render nodes in a grid within this AZ (up to nodesPerRowInAZ columns)
        for (let nodeIdx = 0; nodeIdx < nodesInAZ.length; nodeIdx++) {
          const node = nodesInAZ[nodeIdx]
          const col = nodeIdx % nodesPerRowInAZ
          const row = Math.floor(nodeIdx / nodesPerRowInAZ)

          const nodeBox = new Node(node, this, this.tooltip, pool.podsPerRow, pool.widthPx, pool.heightPx, poolColor)
          nodeBox.draw()

          nodeBox.x = azStartX + col * (pool.widthPx + padding)
          nodeBox.y = poolStartY + row * (pool.heightPx + padding)

          this.addChild(nodeBox)
        }

        // Calculate the height of this AZ's grid
        const azColumnHeight = azRows * (pool.heightPx + padding)

        // Track max column height for this pool
        if (azColumnHeight > poolMaxHeight) {
          poolMaxHeight = azColumnHeight
        }

        // Move to next AZ group (width based on actual columns used)
        azStartX += azWidthPx + azColumnPadding
      }

      // Track the rightmost content edge (exclude trailing azColumnPadding)
      const poolRightEdge = azStartX - azColumnPadding
      if (poolRightEdge > overallMaxX) {
        overallMaxX = poolRightEdge
      }

      // Move currentY past this pool's content
      currentY = poolStartY + poolMaxHeight + 5  // Extra spacing between pools
    }

    // Place unassigned pods
    let unassignedX = overallMaxX + left  // Consistent spacing
    const unassignedY = top + poolHeaderHeight + 2

    for (const pod of Object.values(this.cluster.unassigned_pods)) {
      const podBox = Pod.getOrCreate(pod, this, this.tooltip)
      podBox.x = unassignedX
      podBox.y = unassignedY
      podBox.draw()
      this.addChild(podBox)
      unassignedX += 20
    }

    // Update overall width if unassigned pods extend it
    if (unassignedX > overallMaxX) {
      overallMaxX = unassignedX
    }

    // Draw pool header rects at correct width (after all content is positioned)
    // Add +2 to account for node 2px stroke extending 1px outward on each side
    const poolHeaderWidth = overallMaxX - left + 2
    for (const { header, color } of poolHeaders) {
      header.rect(-1, 0, poolHeaderWidth, poolHeaderHeight)
      header.fill({ color: color, alpha: 0.3 })
      header.stroke({ width: 1, color: color, alpha: 0.8 })
      this.addChild(header)
    }

    // Add AZ headers
    for (const azHeader of azHeaders) {
      this.addChild(azHeader)
    }

    // Draw cluster border (add right padding equal to left)
    const width = overallMaxX + left
    const height = currentY - padding
    this.rect(0, 0, width, height)
    this.stroke({ width: 2, color: App.current.theme.primaryColor })

    // Draw cluster top handle
    const topHandle = this.topHandle = new PIXI.Graphics()
    topHandle.allowChildren = true
    topHandle.rect(0, 0, width, App.current.heightOfTopHandlePx)
    topHandle.fill({ color: App.current.theme.primaryColor })
    topHandle.interactive = true
    topHandle.cursor = 'pointer'
    const that = this
    topHandle.on('click', function (_event) {
      App.current.toggleCluster(that.cluster.id)
    })
    const text = new PIXI.Text({ text: ''.concat(this.cluster.api_server_url, ' (', this.cluster.id, ')'), style: { fontFamily: 'ShareTechMono', fontSize: 10, fill: 0x000000 } })
    text.x = 2
    text.y = 2
    topHandle.addChild(text)
    this.addChild(topHandle)

    // Handle stale data pulsating
    let newTick = null
    const nowSeconds = Date.now() / 1000
    if (this.status && this.status.last_query_time < nowSeconds - 20) {
      newTick = this.pulsate
    }

    if (newTick && newTick != this.tick) {
      this.tick = newTick
      PIXI.Ticker.shared.add(this.tick, this)
    } else if (!newTick && this.tick) {
      PIXI.Ticker.shared.remove(this.tick, this)
      this.tick = null
      this.alpha = 1
      this.tint = 0xffffff
    }
  }
}
