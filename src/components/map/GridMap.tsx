import { useCallback, useEffect, useState } from 'react'
import { Image } from 'react-konva'
import { shallow } from 'zustand/shallow'
import { useGridStore } from '@/store'
import { mapWorker } from '@/util/transform'
import type { GridInfoMessage } from '@/types'
import type { MapRenderResult } from '@/worker'

interface MapProp {
  x: number
  y: number
  width: number
  height: number
  data: ImageBitmap
  info: GridInfoMessage
  rotation?: number
}

const GridMap: React.FC = () => {
  const [gridInfo, mapData] = useGridStore(state => [state.gridInfo, state.mapData], shallow)
  const [mapState, setMapState] = useState<MapProp>()

  const transformMapBackground = useCallback(async (): Promise<MapRenderResult | undefined> => {
    if (!gridInfo || !mapData.length)
      return undefined
    return mapWorker.mapImageData(gridInfo, mapData)
  }, [gridInfo, mapData])

  useEffect(() => {
    const renderMap = async () => {
      if (!gridInfo) {
        setMapState(undefined)
        return
      }

      const mapResult = await transformMapBackground()
      if (!mapResult) {
        setMapState(undefined)
        return
      }

      const { bitmap, optimizedInfo } = mapResult

      const { width, height, resolution, origin } = optimizedInfo
      const positionX = origin.position.x
      const positionY = -(origin.position.y + height * resolution)

      const state: MapProp = {
        x: positionX,
        y: positionY,
        width: width * resolution,
        height: height * resolution,
        data: bitmap,
        info: optimizedInfo,
      }
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
