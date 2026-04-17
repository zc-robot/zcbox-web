import net from 'node:net'

const MQTT_PORT = Number.parseInt(process.env.MQTT_PORT || '1885', 10)
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'robot_pose'
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'zc'
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '8888'
const MQTT_KEEPALIVE_SECONDS = Number.parseInt(process.env.MQTT_KEEPALIVE_SECONDS || '30', 10)
const PINGREQ_PACKET = Buffer.from([0xC0, 0x00])

function encodeString(value) {
  const payload = Buffer.from(value, 'utf8')
  const length = Buffer.alloc(2)
  length.writeUInt16BE(payload.length, 0)
  return Buffer.concat([length, payload])
}

function encodeRemainingLength(length) {
  const bytes = []
  let remaining = length

  do {
    let digit = remaining % 128
    remaining = Math.floor(remaining / 128)
    if (remaining > 0)
      digit |= 0x80
    bytes.push(digit)
  } while (remaining > 0)

  return Buffer.from(bytes)
}

function decodeRemainingLength(buffer, offset = 1) {
  let multiplier = 1
  let value = 0
  let currentOffset = offset

  while (currentOffset < buffer.length) {
    const encodedByte = buffer[currentOffset]
    value += (encodedByte & 0x7F) * multiplier

    if ((encodedByte & 0x80) === 0) {
      return {
        value,
        bytesUsed: currentOffset - offset + 1,
      }
    }

    multiplier *= 128
    currentOffset += 1
  }

  return null
}

function buildConnectPacket(clientId) {
  const flags = 0x80 | 0x40 | 0x02
  const keepAlive = Buffer.alloc(2)
  keepAlive.writeUInt16BE(MQTT_KEEPALIVE_SECONDS, 0)

  const variableHeader = Buffer.concat([
    encodeString('MQTT'),
    Buffer.from([0x04, flags]),
    keepAlive,
  ])
  const payload = Buffer.concat([
    encodeString(clientId),
    encodeString(MQTT_USERNAME),
    encodeString(MQTT_PASSWORD),
  ])
  const remainingLength = encodeRemainingLength(variableHeader.length + payload.length)

  return Buffer.concat([
    Buffer.from([0x10]),
    remainingLength,
    variableHeader,
    payload,
  ])
}

function buildSubscribePacket(packetId, topic) {
  const packetIdBuffer = Buffer.alloc(2)
  packetIdBuffer.writeUInt16BE(packetId, 0)

  const payload = Buffer.concat([
    encodeString(topic),
    Buffer.from([0x00]),
  ])
  const remainingLength = encodeRemainingLength(packetIdBuffer.length + payload.length)

  return Buffer.concat([
    Buffer.from([0x82]),
    remainingLength,
    packetIdBuffer,
    payload,
  ])
}

function yawToQuaternion(yaw) {
  return {
    x: 0,
    y: 0,
    z: Math.sin(yaw / 2),
    w: Math.cos(yaw / 2),
  }
}

function buildRobotInfoMessage(x, y, yaw) {
  return {
    fsm: 'idle',
    localization_quality: 0,
    task_uid: '',
    battery: 0,
    pose: {
      position: {
        x,
        y,
        z: 0,
      },
      orientation: yawToQuaternion(yaw),
      pyr: {
        pitch: 0,
        roll: 0,
        yaw,
      },
    },
  }
}

export function createRobotPoseBridge({ host, onPose, onError, logger = console }) {
  let socket
  let pending = Buffer.alloc(0)
  let heartbeatTimer
  let closed = false
  let packetId = 1

  const fail = (error) => {
    if (closed)
      return

    closed = true
    clearInterval(heartbeatTimer)
    socket?.destroy()
    onError?.(error)
  }

  const close = () => {
    if (closed)
      return

    closed = true
    clearInterval(heartbeatTimer)
    socket?.destroy()
  }

  const handlePublish = (flags, payload) => {
    let offset = 0
    if (payload.length < 2)
      return

    const topicLength = payload.readUInt16BE(offset)
    offset += 2
    if (payload.length < offset + topicLength)
      return

    const topic = payload.toString('utf8', offset, offset + topicLength)
    offset += topicLength

    const qos = (flags >> 1) & 0x03
    if (qos > 0) {
      if (payload.length < offset + 2)
        return
      offset += 2
    }

    const message = payload.subarray(offset)
    if (topic !== MQTT_TOPIC)
      return

    if (message.length !== 12) {
      logger.error(`Unexpected MQTT payload length for ${topic}: ${message.length}`)
      return
    }

    const x = message.readFloatBE(0)
    const y = message.readFloatBE(4)
    const yaw = message.readFloatBE(8)
    onPose?.(buildRobotInfoMessage(x, y, yaw))
  }

  const handlePacket = (header, payload) => {
    const packetType = header >> 4
    const flags = header & 0x0F

    switch (packetType) {
      case 2: {
        if (payload.length < 2)
          return fail(new Error('Received incomplete CONNACK from MQTT broker'))

        const returnCode = payload[1]
        if (returnCode !== 0)
          return fail(new Error(`MQTT broker rejected connection with code ${returnCode}`))

        socket.write(buildSubscribePacket(packetId, MQTT_TOPIC))
        packetId += 1
        heartbeatTimer = setInterval(() => {
          socket.write(PINGREQ_PACKET)
        }, Math.max(MQTT_KEEPALIVE_SECONDS * 500, 10000))
        break
      }
      case 3:
        handlePublish(flags, payload)
        break
      case 9:
      case 13:
        break
      default:
        logger.debug?.(`Ignoring MQTT packet type ${packetType}`)
    }
  }

  socket = net.createConnection({
    host,
    port: MQTT_PORT,
  }, () => {
    const clientId = `zc-web-${process.pid}-${Date.now()}`
    socket.write(buildConnectPacket(clientId))
  })

  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk])

    while (pending.length > 1) {
      const remainingLength = decodeRemainingLength(pending)
      if (remainingLength == null)
        return

      const totalLength = 1 + remainingLength.bytesUsed + remainingLength.value
      if (pending.length < totalLength)
        return

      const header = pending[0]
      const payloadStart = 1 + remainingLength.bytesUsed
      const payload = pending.subarray(payloadStart, totalLength)
      pending = pending.subarray(totalLength)
      handlePacket(header, payload)
    }
  })

  socket.on('error', (error) => {
    fail(error)
  })

  socket.on('close', () => {
    fail(new Error(`MQTT connection closed for ${host}:${MQTT_PORT}`))
  })

  return {
    close,
  }
}
