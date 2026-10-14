import { useState } from 'react'
import apiServer from '@/service/apiServer'
import { createGeneratedLanePaths, createLaneGenerationRequest } from '@/service/laneGeneration'
import type { GenerateLanesData } from '@/service/laneGeneration'
import type { NavPath, NavPoint } from '@/types'

interface GenerateLanesModalProps {
  mapId: number
  points: NavPoint[]
  existingPaths: NavPath[]
  onClose: () => void
  onApply: (result: GenerateLanesData) => void
}

export default function GenerateLanesModal({ mapId, points, existingPaths, onClose, onApply }: GenerateLanesModalProps) {
  const [margin, setMargin] = useState('0.05')
  const [maxDistance, setMaxDistance] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [proposal, setProposal] = useState<{ result: GenerateLanesData; paths: NavPath[] } | null>(null)
  const names = new Map(points.map(point => [point.uid, point.name]))
  const valid = margin.trim() !== '' && Number.isFinite(Number(margin)) && Number(margin) >= 0
    && (maxDistance.trim() === '' || (Number.isFinite(Number(maxDistance)) && Number(maxDistance) > 0))

  const generate = async () => {
    if (!valid || isGenerating)
      return
    setIsGenerating(true)
    setError('')
    setProposal(null)
    try {
      const result = await apiServer.generateLanes(createLaneGenerationRequest(mapId, points, {
        safety_margin: Number(margin),
        max_distance: maxDistance.trim() === '' ? null : Number(maxDistance),
      }))
      let index = 0
      const paths = createGeneratedLanePaths(points, result.lanes, existingPaths, () => `Proposal-${index++}`)
      setProposal({ result, paths })
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : '车道生成失败，请重试')
    }
    finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="fixed z-100 inset-0 flex items-center justify-center bg-gray-900/30" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-lanes-title"
        className="w-32rem max-w-90vw max-h-85vh overflow-auto rounded-2xl border-(solid 1px gray-300) bg-white p-4 shadow-md"
        onClick={event => event.stopPropagation()}>
        <h2 id="generate-lanes-title" className="m-0 text-5 font-bold">自动生成车道</h2>
        <p className="text-sm text-gray-600">检查 {points.length} 个路径点之间的直线通行空间，生成双向车道。</p>
        <p className="text-xs text-gray-500">使用机器人已保存的轮廓检查通行空间。已有车道会保留，重复连接会跳过。</p>
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex items-center justify-between gap-4">
            <span>安全余量(m)</span>
            <input autoFocus type="number" min="0" step="0.01" value={margin} disabled={isGenerating}
              className="w-32 rounded border-(solid 1px gray-300) px-2 py-1.5"
              onChange={(event) => {
                setMargin(event.target.value)
                setProposal(null)
              }} />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span>最大连接距离(m)</span>
            <input type="number" min="0.001" step="0.1" value={maxDistance} placeholder="不限" disabled={isGenerating}
              className="w-32 rounded border-(solid 1px gray-300) px-2 py-1.5"
              onChange={(event) => {
                setMaxDistance(event.target.value)
                setProposal(null)
              }} />
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {proposal && (
          <div aria-live="polite" className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
            <div className="font-bold">可添加 {proposal.paths.length} 条车道</div>
            <div className="mt-1 text-gray-600">机器人包络半径：{proposal.result.robot_radius.toFixed(3)}m</div>
            <div className="mt-1 text-gray-600">
              {proposal.result.connected_components.length} 个连通组 · {proposal.result.isolated_waypoints.length} 个孤立点
            </div>
            <ul className="my-2 max-h-40 overflow-auto pl-5 text-gray-600">
              {proposal.paths.slice(0, 100).map(path => <li key={path.uid}>{names.get(path.start.uid)} ↔ {names.get(path.end.uid)}</li>)}
            </ul>
            {proposal.paths.length > 100 && <div className="text-xs text-gray-500">仅列出前 100 条，共 {proposal.paths.length} 条车道</div>}
            {proposal.result.invalid_waypoints.map(point => (
              <div key={point.uid} className="mt-1 text-amber-700">
                {names.get(point.uid) ?? point.uid}：{point.reason === 'outside_map' ? '位于地图外' : '通行空间不足'}
              </div>
            ))}
            <p className="mb-0 text-xs text-gray-500">添加后可在地图上检查车道，再使用“保存”保存配置。</p>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-3 text-sm">
          <button type="button" className="rounded-lg border-none bg-gray-200 px-4 py-2" onClick={onClose}>取消</button>
          <button type="button" disabled={!valid || isGenerating}
            className="rounded-lg border-none bg-blue-600 px-4 py-2 text-white disabled:opacity-45" onClick={generate}>
            {isGenerating ? '正在生成…' : proposal ? '重新生成' : '生成预览'}
          </button>
          {proposal && (
            <button type="button" disabled={!proposal.paths.length || isGenerating}
              className="rounded-lg border-none bg-emerald-600 px-4 py-2 text-white disabled:opacity-45"
              onClick={() => onApply(proposal.result)}>添加车道</button>
          )}
        </div>
      </section>
    </div>
  )
}
