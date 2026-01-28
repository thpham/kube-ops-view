import { Pod } from './pod.js'
import Bars from './bars.js'
import { parseResource } from './utils.js'
import App from './app'
const PIXI = require('pixi.js')


export const isMaster = (labels) => {
  for (var key in labels) {
    if (key == 'node-role.kubernetes.io/master' ||
      key == 'node-role.kubernetes.io/control-plane' ||
      key == 'kubernetes.io/role' && labels[key] == 'master' ||
      key == 'master' && labels[key] == 'true') {
      return true
    }
  }
}

// Pool type priority order for sorting (lower = higher priority/rendered first)
export const POOL_PRIORITY = {
  'master': 0,
  'control-plane': 0,
  'infra': 1,
  'infrastructure': 1,
  'monitoring': 2,
  'worker': 10,
  'compute': 10,
  'default': 10
}

// Colors for different pool types (used for top handle)
export const POOL_COLORS = {
  'master': 0xff9999,        // red-ish
  'control-plane': 0xff9999, // red-ish
  'infra': 0xffcc66,         // orange
  'infrastructure': 0xffcc66,
  'monitoring': 0xcc99ff,    // purple
  'worker': 0xaaaaff,        // default blue
  'compute': 0xaaaaff,
  'default': 0xaaaaff
}

/**
 * Extracts the pool type from node labels.
 * Looks for node-role.kubernetes.io/<role> labels (Kubernetes/OpenShift convention)
 * and other common labeling patterns.
 * @param {Object} labels - Node labels object
 * @returns {string} - Pool type name (e.g., 'master', 'infra', 'worker')
 */
export const getNodePoolType = (labels) => {
  const poolTypes = []

  for (const key in labels) {
    // Standard Kubernetes node-role labels: node-role.kubernetes.io/<role>
    if (key.startsWith('node-role.kubernetes.io/')) {
      const role = key.replace('node-role.kubernetes.io/', '')
      if (role && role !== '') {
        poolTypes.push(role)
      }
    }
    // Legacy kubernetes.io/role label
    else if (key === 'kubernetes.io/role') {
      poolTypes.push(labels[key])
    }
    // OpenShift node type label
    else if (key === 'node.openshift.io/os_id') {
      // Skip, this is OS identifier not pool type
    }
    // Custom pool label patterns
    else if (key === 'node-pool' || key === 'nodepool' || key === 'pool') {
      poolTypes.push(labels[key])
    }
    // GKE node pool
    else if (key === 'cloud.google.com/gke-nodepool') {
      poolTypes.push(labels[key])
    }
    // EKS node group
    else if (key === 'eks.amazonaws.com/nodegroup') {
      poolTypes.push(labels[key])
    }
    // AKS node pool
    else if (key === 'agentpool' || key === 'kubernetes.azure.com/agentpool') {
      poolTypes.push(labels[key])
    }
  }

  // If no pool type found, return 'worker' as default
  if (poolTypes.length === 0) {
    return 'worker'
  }

  // Sort by priority and return the highest priority pool type
  poolTypes.sort((a, b) => {
    const keyA = a.toLowerCase()
    const keyB = b.toLowerCase()
    const priorityA = keyA in POOL_PRIORITY ? POOL_PRIORITY[keyA] : POOL_PRIORITY['default']
    const priorityB = keyB in POOL_PRIORITY ? POOL_PRIORITY[keyB] : POOL_PRIORITY['default']
    return priorityA - priorityB
  })

  return poolTypes[0].toLowerCase()
}

/**
 * Gets all unique pool types from a node's labels (for display purposes)
 * @param {Object} labels - Node labels object
 * @returns {string[]} - Array of pool type names
 */
export const getAllNodePoolTypes = (labels) => {
  const poolTypes = []

  for (const key in labels) {
    if (key.startsWith('node-role.kubernetes.io/')) {
      const role = key.replace('node-role.kubernetes.io/', '')
      if (role && role !== '') {
        poolTypes.push(role)
      }
    }
  }

  return poolTypes.length > 0 ? poolTypes : ['worker']
}

/**
 * Gets the color for a pool type
 * @param {string} poolType - Pool type name
 * @returns {number} - PIXI color value
 */
export const getPoolColor = (poolType) => {
  const key = poolType.toLowerCase()
  return key in POOL_COLORS ? POOL_COLORS[key] : POOL_COLORS['default']
}

/**
 * Extracts the Availability Zone from node labels.
 * Looks for standard Kubernetes topology labels.
 * @param {Object} labels - Node labels object
 * @returns {string} - AZ name (e.g., 'us-east-1a', 'zone-1') or 'unknown' if not found
 */
export const getNodeAZ = (labels) => {
  // Standard Kubernetes topology label (preferred)
  if (labels['topology.kubernetes.io/zone']) {
    return labels['topology.kubernetes.io/zone']
  }
  // Legacy zone label
  if (labels['failure-domain.beta.kubernetes.io/zone']) {
    return labels['failure-domain.beta.kubernetes.io/zone']
  }
  // GKE specific
  if (labels['cloud.google.com/gke-zone']) {
    return labels['cloud.google.com/gke-zone']
  }
  // Azure zones
  if (labels['topology.kubernetes.io/zone']) {
    return labels['topology.kubernetes.io/zone']
  }
  // Custom zone labels
  if (labels['zone']) {
    return labels['zone']
  }
  if (labels['availability-zone']) {
    return labels['availability-zone']
  }

  return 'unknown'
}

export class Node extends PIXI.Graphics {
  constructor(node, cluster, tooltip, podsPerRow, widthOfNodePx, heightOfNodePx, poolColor = null) {
    super()
    this.node = node
    this.cluster = cluster
    this.tooltip = tooltip
    this.podsPerRow = podsPerRow
    this.widthOfNodePx = widthOfNodePx
    this.heightOfNodePx = heightOfNodePx
    // Use pool color if provided, otherwise fall back to theme color
    this.poolColor = poolColor
  }

  getResourceUsage() {
    const resources = {}
    for (const key of Object.keys(this.node.status.capacity)) {
      resources[key] = {
        'capacity': parseResource(this.node.status.capacity[key]),
        'reserved': 0,
        'requested': 0,
        'used': 0
      }
      const allocatable = this.node.status.allocatable[key]
      if (allocatable) {
        resources[key]['reserved'] = resources[key]['capacity'] - parseResource(allocatable)
      }
    }
    if (this.node.usage) {
      for (const key of Object.keys(this.node.usage)) {
        resources[key]['used'] = parseResource(this.node.usage[key])
      }
    }
    let numberOfPods = 0
    for (const pod of Object.values(this.node.pods)) {
      numberOfPods++
      // do not account for completed jobs
      if (pod.phase != 'Succeeded') {
        for (const container of pod.containers) {
          if (container.resources && container.resources.requests) {
            for (const key of Object.keys(container.resources.requests)) {
              resources[key].requested += parseResource(container.resources.requests[key])
            }
          }
        }
      }
    }
    resources['pods'].requested = numberOfPods
    resources['pods'].used = numberOfPods
    return resources
  }

  draw() {
    const nodeBox = this
    const topHandle = new PIXI.Graphics()
    // Use pool color if available, otherwise fall back to theme color
    const handleColor = this.poolColor || App.current.theme.primaryColor
    topHandle.beginFill(handleColor, 1)
    topHandle.drawRect(0, 0, this.widthOfNodePx, App.current.heightOfTopHandlePx)
    topHandle.endFill()

    // Check for multiple roles
    const allRoles = getAllNodePoolTypes(this.node.labels)
    const hasMultipleRoles = allRoles.length > 1

    // there is about 2.83 letters per pod
    const roomForText = Math.floor(2.83 * this.podsPerRow)
    // Reserve space for multi-role indicator if needed
    const indicatorWidth = hasMultipleRoles ? 14 : 0
    const availableTextRoom = roomForText - (indicatorWidth > 0 ? 3 : 0)
    const ellipsizedNodeName = this.node.name.length > availableTextRoom ? this.node.name.substring(0, availableTextRoom).concat('…') : this.node.name
    const text = new PIXI.Text(ellipsizedNodeName, { fontFamily: 'ShareTechMono', fontSize: 10, fill: 0x000000 })
    text.x = 2
    text.y = 2
    topHandle.addChild(text)

    // Add multi-role indicator badge if node has multiple roles
    if (hasMultipleRoles) {
      const badge = new PIXI.Graphics()
      // Use a contrasting color for the badge
      badge.beginFill(0x333333, 0.8)
      badge.drawRoundedRect(0, 0, 12, 10, 2)
      badge.endFill()

      // Show number of additional roles
      const badgeText = new PIXI.Text(`+${allRoles.length - 1}`, { fontFamily: 'ShareTechMono', fontSize: 7, fill: 0xffffff })
      badgeText.x = 2
      badgeText.y = 1
      badge.addChild(badgeText)

      badge.x = this.widthOfNodePx - 14
      badge.y = 2
      topHandle.addChild(badge)
    }
    nodeBox.addChild(topHandle)
    // Use pool color for node border if available
    nodeBox.lineStyle(2, handleColor, 1)
    nodeBox.beginFill(App.current.theme.secondaryColor, 1)
    nodeBox.drawRect(0, 0, this.widthOfNodePx, this.heightOfNodePx)
    nodeBox.endFill()
    nodeBox.lineStyle(2, 0xaaaaaa, 1)
    topHandle.interactive = true
    topHandle.on('mouseover', function () {
      let s = nodeBox.node.name
      // Show pool type and AZ prominently
      const allPoolTypes = getAllNodePoolTypes(nodeBox.node.labels)
      const az = getNodeAZ(nodeBox.node.labels)
      s += '\nPool: ' + allPoolTypes.join(', ')
      s += '\nAZ: ' + az
      s += '\nLabels:'
      for (const key of Object.keys(nodeBox.node.labels).sort()) {
        s += '\n  ' + key + ': ' + nodeBox.node.labels[key]
      }
      nodeBox.tooltip.setText(s)
      nodeBox.tooltip.position = nodeBox.toGlobal(new PIXI.Point(0, App.current.heightOfTopHandlePx))
      nodeBox.tooltip.visible = true
    })
    topHandle.on('mouseout', function () {
      nodeBox.tooltip.visible = false
    })
    if (App.current.config.nodeLinkUrlTemplate !== null) {
      topHandle.buttonMode = true
      topHandle.on('click', function () {
        location.href = App.current.config.nodeLinkUrlTemplate.replace('{cluster}', nodeBox.cluster.cluster.id).replace('{name}', nodeBox.node.name)
      })
    }
    const resources = this.getResourceUsage()
    const bars = new Bars(nodeBox, resources, nodeBox.tooltip)
    bars.x = 0
    bars.y = 1
    nodeBox.addChild(bars.draw())

    nodeBox.addPods(App.current.sorterFn)
    return nodeBox
  }

  addPods(sorterFn) {
    const nodeBox = this
    const px = App.current.startDrawingPodsAt
    const py = App.current.heightOfTopHandlePx + 5
    let podsCounter = 0
    let podsKubeSystemCounter = 0
    const pods = Object.values(this.node.pods).sort(sorterFn)
    for (const pod of pods) {
      if (pod.namespace != 'kube-system') {
        const podBox = Pod.getOrCreate(pod, this.cluster, this.tooltip)
        podBox.movePodTo(
          new PIXI.Point(
            // we have a room for this.cluster.podsPerRow pods
            px + (App.current.sizeOfPodPx * (podsCounter % this.podsPerRow)),
            // we just count when to get to another row
            py + (App.current.sizeOfPodPx * Math.floor(podsCounter / this.podsPerRow))
          )
        )
        nodeBox.addChild(podBox.draw())
        podsCounter++
      } else {
        // kube-system pods
        const podBox = Pod.getOrCreate(pod, this.cluster, this.tooltip)
        podBox.movePodTo(
          new PIXI.Point(
            // we have a room for this.cluster.podsPerRow pods
            px + (App.current.sizeOfPodPx * (podsKubeSystemCounter % this.podsPerRow)),
            // like above (for not kube-system pods), but we count from the bottom
            this.heightOfNodePx - App.current.sizeOfPodPx - 2 - (App.current.sizeOfPodPx * Math.floor(podsKubeSystemCounter / this.podsPerRow))
          )
        )
        nodeBox.addChild(podBox.draw())
        podsKubeSystemCounter++
      }
    }
  }
}
