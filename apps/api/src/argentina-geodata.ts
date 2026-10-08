import { FoundationOfficialResearchSchema, type FoundationOfficialResearch, type ProjectFoundations } from '@t3-designer/scene-schema'
import type { FoundationGeodataContext, FoundationGeodataOptions } from './foundation-geodata.ts'
import { acquireArgentineAddress, argentineProvince, type ArgentineAddressResult } from './argentina-georef.ts'
import { acquireCabaParcels } from './argentina-caba-cadastre.ts'
import { acquireProvincialParcels } from './argentina-provincial-cadastre.ts'
import { localArea, localParcelRings } from './argentina-local-geometry.ts'
import type { ArgentineParcelLookup } from './argentina-geodata-types.ts'

export async function acquireArgentineFoundationGeodata(input: ProjectFoundations['building'], options: FoundationGeodataOptions): Promise<FoundationGeodataContext> {
  options.signal.throwIfAborted()
  options.onEvent?.({ kind: 'search', message: 'Consultando las fuentes oficiales argentinas según la jurisdicción.' })
  const caba = argentineProvince(input.region, input.address)?.id === '02' ? await acquireCabaParcels({ address: input.address, reference: input.cadastralReference }, options) : null
  const address: ArgentineAddressResult = caba ? { geocode: caba.geocode ? { ...caba.geocode, provider: 'usig-caba' } : null,
    provinceId: '02', jurisdiction: 'Ciudad Autónoma de Buenos Aires', sources: caba.sources, unknowns: caba.unknowns,
    questions: caba.geocode ? [] : ['USIG no pudo identificar una dirección única de CABA. Revisá el nombre completo de la calle y el número.'] }
    : await acquireArgentineAddress(input, options)
  const research: FoundationOfficialResearch = { countryCode: 'AR', jurisdiction: address.jurisdiction || 'Argentina', summary: '',
    geocode: address.geocode, sources: address.sources, unknowns: address.unknowns, parcels: [], selectedParcelId: null, selectionEvidence: null }
  const questions = [...address.questions]
  if (research.geocode) {
    const { longitude, latitude } = research.geocode
    let lookup: ArgentineParcelLookup = { parcels: [], sources: [], unknowns: [] }
    if (caba) lookup = { ...caba, sources: [], unknowns: [] }
    else if (['06', '14'].includes(address.provinceId)) {
      lookup = await acquireProvincialParcels({ provinceId: address.provinceId, longitude, latitude, reference: input.cadastralReference }, options)
    } else lookup.unknowns.push(`No hay un adaptador parcelario directo habilitado para ${address.jurisdiction}. La dirección normalizada no acredita catastro.`)
    research.sources.push(...lookup.sources); research.unknowns.push(...lookup.unknowns)
    for (const parcel of lookup.parcels.slice(0, 20)) {
      const rings = localParcelRings(parcel.rings, [longitude, latitude])
      if (!rings) { research.unknowns.push(`La parcela ${parcel.id} no se pudo representar de forma íntegra dentro del área local: no se simplificó ni sustituyó su contorno.`); continue }
      const [footprint, ...holes] = rings
      const calculatedArea = localArea(footprint) - holes.reduce((sum, hole) => sum + localArea(hole), 0)
      research.parcels.push({ id: parcel.id, label: parcel.label, footprint, ...(holes.length ? { holes } : {}), area: parcel.publishedArea ?? calculatedArea,
        areaBasis: parcel.publishedArea === null ? 'calculated' : 'published', sourceUrl: parcel.sourceUrl, provider: parcel.provider,
        sourceDate: parcel.sourceDate, attribution: parcel.attribution })
    }
    const reference = address.provinceId === '06' ? input.cadastralReference?.trim().toUpperCase() : input.cadastralReference?.trim()
    const selected = reference ? research.parcels.find(parcel => parcel.id === reference) : undefined
    if (selected) {
      research.selectedParcelId = selected.id
      research.selectionEvidence = `Referencia catastral indicada explícitamente por el usuario: ${reference}. El registro se obtuvo del servicio de su jurisdicción; esto no acredita titularidad.`
      questions.push('La parcela está identificada. Para reconstruir el edificio aportá su huella o medidas y altura; el límite del terreno no equivale al contorno construido.')
    } else if (research.parcels.length) questions.push(reference ? 'La referencia indicada no se obtuvo en esta ubicación. Revisá la nomenclatura catastral y la dirección.' : 'Revisá las parcelas encontradas e indicá la referencia catastral correcta en los datos del edificio antes de continuar.')
    else questions.push('No se obtuvo una parcela representable para esta dirección. Aportá la referencia catastral o un extracto oficial de la jurisdicción.')
    research.unknowns.push('Coordenadas WGS84 convertidas a metros en el plano tangente local: X este, Z sur, origen en la dirección consultada. No hay cota altimétrica ni alturas de edificio en estas capas parcelarias.')
  }
  research.summary = research.parcels.length ? `Consulta oficial de ${research.jurisdiction}: ${research.parcels.length} ${research.parcels.length === 1 ? 'parcela obtenida' : 'parcelas obtenidas'}${research.selectedParcelId ? ', con la referencia indicada identificada' : research.parcels.length === 1 ? ', pendiente de confirmar' : ', pendientes de confirmar'}.`
    : research.geocode ? `Dirección normalizada en ${research.jurisdiction}; la parcela sigue sin resolver.` : `La ubicación en ${research.jurisdiction} necesita más información.`
  research.unknowns = [...new Set(research.unknowns)].slice(0, 100)
  const parsed = FoundationOfficialResearchSchema.parse(research)
  options.onEvent?.({ kind: 'search', message: research.summary })
  return { status: 'partial', summary: research.summary, questions: [...new Set(questions)], sources: research.sources, unknowns: research.unknowns,
    geocode: null, context: null, officialResearch: parsed }
}
