import { useEffect, useRef, useState } from 'react'
import { Image } from 'react-konva'
import { useGridStore } from '@/store'
import { mapWorker } from '@/util/transform'
import { getCostmapCanvasPlacement } from '@/util/costmapModel'
import type { CostmapLayer } from '@/util/costmapModel'

interface CostmapLayerProps {
  layer: CostmapLayer
}

interface CostmapImageState {
  image: ImageBitmap
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

const CostmapLayerView: React.FC<CostmapLayerProps> = ({ layer }) => {
  const grid = useGridStore(state => state.costmaps[layer].grid)
  const [imageState, setImageState] = useState<CostmapImageState | null>(null)
  const imageRef = useRef<ImageBitmap | null>(null)

  useEffect(() => {
    let disposed = false

    if (!grid) {
      imageRef.current?.close()
      imageRef.current = null
      setImageState(null)
      return
    }

    const render = async () => {
      const result = await mapWorker.costmapImageData(grid, layer)
      if (disposed) {
        result.bitmap.close()
        return
      }

      const placement = getCostmapCanvasPlacement(result.optimizedInfo)
      imageRef.current?.close()
      imageRef.current = result.bitmap
      setImageState({
        image: result.bitmap,
        ...placement,
      })
    }

    void render().catch((error) => {
      console.warn(`Failed to render ${layer} costmap`, error)
    })

    return () => {
      disposed = true
    }
  }, [grid, layer])

  useEffect(() => () => {
    imageRef.current?.close()
    imageRef.current = null
  }, [])

  if (!imageState)
    return null

  return (
    <Image
      listening={false}
      image={imageState.image}
      x={imageState.x}
      y={imageState.y}
      width={imageState.width}
      height={imageState.height}
      rotation={imageState.rotation} />
  )
}

export default CostmapLayerView
