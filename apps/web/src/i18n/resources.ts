import esCommon from './locales/es/common.ts'
import enCommon from './locales/en/common.ts'
import frCommon from './locales/fr/common.ts'
import esWorkspace from './locales/es/workspace.ts'
import enWorkspace from './locales/en/workspace.ts'
import frWorkspace from './locales/fr/workspace.ts'
import esDossier from './locales/es/dossier.ts'
import enDossier from './locales/en/dossier.ts'
import frDossier from './locales/fr/dossier.ts'
import esAssets from './locales/es/assets.ts'
import enAssets from './locales/en/assets.ts'
import frAssets from './locales/fr/assets.ts'

export const resources = {
  es: { common: esCommon, workspace: esWorkspace, dossier: esDossier, assets: esAssets },
  en: { common: enCommon, workspace: enWorkspace, dossier: enDossier, assets: enAssets },
  fr: { common: frCommon, workspace: frWorkspace, dossier: frDossier, assets: frAssets },
} as const

/** Preserve keys/structure, while allowing each locale to supply its own words. */
export type TranslationShape<T> = { [K in keyof T]: T[K] extends string ? string : TranslationShape<T[K]> }

// Adding/removing a source key makes incomplete translations fail typecheck.
const checkedResources: Record<'es' | 'en' | 'fr', TranslationShape<typeof resources.es>> = resources
void checkedResources
