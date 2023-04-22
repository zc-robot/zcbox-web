import { useAppSelector } from "@/store"
import { selectGridInfo, selectMapImageData } from "@/store/grid"
import { quaternionToAngle } from "@/util/transform"
import Konva from "konva"
import { useEffect, useRef, useState } from "react"
import { Image } from 'react-konva'

interface MapState {
  x: number,
  y: number,
  width?: number,
  height?: number,
  data?: CanvasImageSource,
  rotation?: number,
}

const GridMap: React.FC = () => {
  const imageRef = useRef<Konva.Image>(null)
  const gridInfo = useAppSelector(selectGridInfo)
  const imageData = useAppSelector(selectMapImageData)
  const [mapState, setMapState] = useState<MapState>()

  useEffect(() => {
    const renderMap = async () => {
      if (!gridInfo) return

      const width = gridInfo.width
      const height = gridInfo.height
      const resolution = gridInfo.resolution
      const bitmap = imageData ? await createImageBitmap(imageData) : undefined

      const state = {
        x: gridInfo.origin.position.x,
        y: -(gridInfo.origin.position.y + height * resolution),
        width: width * resolution,
        height: height * resolution,
        data: bitmap,
        rotation: quaternionToAngle(gridInfo.origin.orientation)
      }
      setMapState(state)
    }
    renderMap()
  }, [gridInfo, imageData])

  return (
    <>
      <Image
        ref={imageRef}
        image={mapState?.data}
        x={mapState?.x}
        y={mapState?.y}
        width={mapState?.width}
        height={mapState?.height}
        rotation={mapState?.rotation} />
    </>
  )
}

export default GridMap
