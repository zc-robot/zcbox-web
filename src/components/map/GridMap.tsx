import { useEffect, useState } from 'react'
import { Image } from 'react-konva'
import { useGridStore } from '@/store'
import { selectMapImageData } from '@/store/grid'

interface MapProp {
  x: number
  y: number
  width?: number
  height?: number
  data: CanvasImageSource
  rotation?: number
}

const GridMap: React.FC = () => {
  const gridInfo = useGridStore(state => state.gridInfo)
  const imageData = useGridStore(selectMapImageData)
  const [mapState, setMapState] = useState<MapProp>()

  useEffect(() => {
    const renderMap = async () => {
      if (!gridInfo) {
        setMapState(undefined)
        return
      }

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
      } as MapProp
      setMapState(state)
    }
    renderMap()
  }, [gridInfo, imageData])

  return (
    <>
    {mapState && <Image
      image={mapState.data}
      x={mapState.x}
      y={mapState.y}
      width={mapState.width}
      height={mapState.height} /> }
    </>
  )
}

export default GridMap
