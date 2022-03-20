import React, { useEffect, useState } from "react"
import { Layer, Stage, Image } from "react-konva"
import { useAppSelector } from "src/store"
import { msg } from "src/store/demo"
import { selectGridMessage } from "src/store/grid"

const defaultMargin = { top: 50, right: 50, bottom: 50, left: 50 }

export interface PanelProps {
  width: number
  height: number
  margin?: { top: number; right: number; bottom: number; left: number }
}


const Panel: React.FC<PanelProps> = ({ width, height, margin = defaultMargin }) => {
  const offscreenCanvas = document.createElement("canvas")
  const message = useAppSelector(selectGridMessage)
  const [canvas, setCanvas] = useState<HTMLCanvasElement>()
  const [imageProp, setImageProp] = useState<{
    width: number,
    height: number,
    x: number,
    y: number,
    scale: number,
  }>()

  const getColorVal = (value: number) => {
    switch (value) {
      case 100:
        return 0
      case 0:
        return 255
      default:
        return 127
    }
  }

  const renderMap = () => {
    if (!message) return
    const ctx = offscreenCanvas.getContext("2d")
    if (!ctx) return

    const gridWidth = message.info.width
    const gridHeight = message.info.height
    offscreenCanvas.width = gridWidth
    offscreenCanvas.height = gridHeight
    const imageData = ctx.createImageData(message.info.width, message.info.height)
    for (var row = 0; row < gridHeight; row++) {
      for (var col = 0; col < gridWidth; col++) {
        // determine the index into the map data
        const mapI = col + ((gridHeight - row - 1) * gridWidth)
        // determine the value
        const data = message.data[mapI]
        const colorVal = getColorVal(data)

        // determine the index into the image data array
        var i = (col + (row * gridWidth)) * 4
        // r
        imageData.data[i] = colorVal
        // g
        imageData.data[++i] = colorVal
        // b
        imageData.data[++i] = colorVal
        // a
        imageData.data[++i] = 255
      }
    }
    ctx.putImageData(imageData, 0, 0)

    const scale = message.info.resolution
    let imageWidth = gridWidth * scale
    let imageHeight = gridHeight * scale

    // set the pose
    const x = msg.info.origin.position.x
    const y = -gridHeight * scale - msg.info.origin.position.y

    const p = {
      width: imageWidth,
      height: imageHeight,
      x,
      y,
      scale: 1 / scale,
    }
    console.log(p)
    // setImageProp(p)
    setCanvas(offscreenCanvas)
  }

  useEffect(() => renderMap(), [message])

  return (
    <Stage width={width} height={height}>
      <Layer>
        <Image image={canvas}
          x={imageProp?.x}
          y={imageProp?.y}
          width={imageProp?.width}
          height={imageProp?.height}
          scaleX={imageProp?.scale}
          scaleY={imageProp?.scale} />
      </Layer>
    </Stage>

  )
}

export default Panel
