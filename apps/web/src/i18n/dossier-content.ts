import type { TFunction } from 'i18next'
import { dossierFacts, dossierObservations, dossierQuestions, dossierSources, type DossierFact } from '../data/dossier.ts'
import { APARTMENT_PLACEMENT } from '../data/apartment-placement.ts'
import { SITE_PARCEL } from '../data/building-site.ts'
import { dateFormatter, numberFormatter, type Locale } from './locale.ts'
import { resources } from './resources.ts'
import { roomLabel } from './workspace-labels.ts'

export type LocalizedFact = Omit<DossierFact, 'scope'> & { scope: string }

function recordId<T extends object>(catalog: T, id: string): keyof T & string {
  if (!Object.hasOwn(catalog, id)) throw new Error(`Missing dossier translation for ${id}`)
  return id as keyof T & string
}

/** Preserve the precision of the Spanish source transcription, including trailing zeros. */
function fractionDigits(value: string) {
  return value.match(/,(\d+)/)?.[1].length ?? 0
}

function sourceValue(fact: DossierFact, locale: Locale) {
  if (fact.numericValue !== undefined) {
    return fact.id === 'construction-year' ? String(fact.numericValue)
      : numberFormatter(locale, fractionDigits(fact.value)).format(fact.numericValue)
  }
  if (['address-point', 'ground-altitudes', 'roof-altitudes', 'source-accuracy'].includes(fact.id)) {
    return fact.value.replace(/[−-]?\d+(?:,\d+)?/g, value =>
      numberFormatter(locale, fractionDigits(value)).format(Number(value.replace('−', '-').replace(',', '.'))))
  }
  if (fact.id === 'ign-record-updated') {
    const [day, month, year] = fact.value.split('/')
    return dateFormatter(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${year}-${month}-${day}T12:00:00Z`))
  }
  return fact.value
}

/** Localized copies for display AND search; source identity/evidence remain immutable. */
export function localizeDossier(locale: Locale, t: TFunction<'dossier'>, workspaceT: TFunction<'workspace'>) {
  const catalog = resources[locale].dossier
  const facts: LocalizedFact[] = dossierFacts.map(fact => {
    const id = recordId(catalog.facts, fact.id)
    const values = {
      value: fact.value === 'Sin dato' ? t('ui.noData') : sourceValue(fact, locale),
      room: fact.roomId ? roomLabel(workspaceT, fact.roomId) : '',
      id: SITE_PARCEL.id,
      elevation: numberFormatter(locale, 2).format(APARTMENT_PLACEMENT.floorElevation),
      azimuth: numberFormatter(locale, 2).format(APARTMENT_PLACEMENT.livingFacadeAzimuth),
    }
    return {
      ...fact,
      label: t(`facts.${id}.label`, values),
      value: t(`facts.${id}.value`, values),
      note: t(`facts.${id}.note`, values),
      scope: catalog.ui.scope[fact.scope],
      evidence: fact.evidence.map((item, index) => ({ ...item, locator: catalog.evidenceLocators[id][index] })),
    }
  })
  const sources = dossierSources.map(source => {
    const id = recordId(catalog.sources, source.id)
    return { ...source, ...catalog.sources[id], publisher: catalog.publishers[id] }
  })
  const questions = dossierQuestions.map(question => ({ ...question, ...catalog.questions[recordId(catalog.questions, question.id)] }))
  const observations = dossierObservations.map(observation => ({ ...observation, ...catalog.observations[recordId(catalog.observations, observation.id)] }))
  return { facts, sources, questions, observations }
}

export function matchesDossierQuery(query: string, text: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  return normalize(text).includes(normalize(query.trim()))
}
