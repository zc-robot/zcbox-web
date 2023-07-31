import { useCallback, useEffect, useState } from 'react'
import { Image } from 'react-konva'
import { shallow } from 'zustand/shallow'
import { useGridStore } from '@/store'
import { mapWorker } from '@/util/transform'

interface MapProp {
  x: number
  y: number
  width?: number
  height?: number
  data: ImageBitmap
  rotation?: number
}

const GridMap: React.FC = () => {
  const [gridInfo, mapData] = useGridStore(state => [state.gridInfo, state.mapData], shallow)
  const [mapState, setMapState] = useState<MapProp>()

  const transformMapBackground = useCallback(async () => {
    if (!gridInfo || !mapData.length)
      return undefined
    const bitmap = await mapWorker.mapImageData(gridInfo, mapData)
    return bitmap
  }, [gridInfo, mapData])

  useEffect(() => {
    const renderMap = async () => {
      if (!gridInfo) {
        setMapState(undefined)
        return
      }

      const width = gridInfo.width
      const height = gridInfo.height
      const resolution = gridInfo.resolution
      const bitmap = await transformMapBackground()

      const state = {
        x: gridInfo.origin.position.x,
        y: -(gridInfo.origin.position.y + height * resolution),
        width: width * resolution,
        height: height * resolution,
        data: bitmap,
      } as MapProp
      setMapState((prevState) => {
        // NOTE: Release previous ImageBitmap to avoid memory leak
        if (prevState?.data)
          prevState.data.close()

        return state
      })
    }
    renderMap()
  }, [gridInfo, transformMapBackground])

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
