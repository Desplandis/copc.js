import type { LazPerf } from 'laz-perf'
import * as Las from '../las'
import { Binary, Getter } from '../utils'

import { Hierarchy } from './hierarchy'
import { Info } from './info'

export type Copc = {
  header: Las.Header
  vlrs: Las.Vlr[]
  info: Info
  eb: Las.ExtraBytes[]
  wkt?: string
}
export const Copc = {
  create,
  loadHierarchyPage,
  loadPointDataBuffer,
  loadPointDataView,
}

/**
 * Parse the COPC header and walk VLR and EVLR metadata.
 */
async function create(filename: string | Getter): Promise<Copc> {
  const get = Getter.create(filename)
  const header = Las.Header.parse(await get(0, Las.Constants.minHeaderLength))
  const vlrs = await Las.Vlr.walk(get, header)

  const infoVlr = Las.Vlr.find(vlrs, 'copc', 1)
  if (!infoVlr) throw new Error('COPC info VLR is required')
  const info = Info.parse(await Las.Vlr.fetch(get, infoVlr))

  let wkt: string | undefined
  const wktVlr = Las.Vlr.find(vlrs, 'LASF_Projection', 2112)
  if (wktVlr) wkt = Binary.toCString(await Las.Vlr.fetch(get, wktVlr))

  let eb: Las.ExtraBytes[] = []
  const ebVlr = Las.Vlr.find(vlrs, 'LASF_Spec', 4)
  if (ebVlr) eb = Las.ExtraBytes.parse(await Las.Vlr.fetch(get, ebVlr))

  return { header, vlrs, info, wkt, eb }
}

async function loadHierarchyPage(
  filename: string | Getter,
  page: Hierarchy.Page
) {
  const get = Getter.create(filename)
  return Hierarchy.load(get, page)
}

async function loadCompressedPointDataBuffer(
  filename: string | Getter,
  { pointDataOffset, pointDataLength }: Hierarchy.Node
) {
  const get = Getter.create(filename)
  return get(pointDataOffset, pointDataOffset + pointDataLength)
}

async function loadPointDataBuffer(
  filename: string | Getter,
  { pointDataRecordFormat, pointDataRecordLength }: Las.Header,
  node: Hierarchy.Node,
  lazPerf?: LazPerf
) {
  const compressed = await loadCompressedPointDataBuffer(filename, node)

  const { pointCount } = node
  return Las.PointData.decompressChunk(
    compressed,
    { pointCount, pointDataRecordFormat, pointDataRecordLength },
    lazPerf
  )
}

type Options = { lazPerf?: LazPerf; include?: string[] }
async function loadPointDataView(
  filename: string | Getter,
  copc: Copc,
  node: Hierarchy.Node,
  { lazPerf, include }: Options = {}
) {
  const buffer = await loadPointDataBuffer(filename, copc.header, node, lazPerf)
  return Las.View.create(buffer, copc.header, copc.eb, include)
}
