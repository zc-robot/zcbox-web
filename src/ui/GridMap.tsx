import useGridStore, { selectMapImageData } from "@/store/grid"
import Konva from "konva"
import { useEffect, useRef, useState } from "react"
import { Image } from 'react-konva'

interface MapProp {
  x: number,
  y: number,
  width?: number,
  height?: number,
  data?: CanvasImageSource,
  rotation?: number,
}

const GridMap: React.FC = () => {
  const imageRef = useRef<Konva.Image>(null)
  const gridInfo = useGridStore((state) => state.gridInfo)
  const imageData = useGridStore(selectMapImageData)
  const [mapState, setMapState] = useState<MapProp>()

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
        height={mapState?.height} />
    </>
  )
}

export default GridMap
