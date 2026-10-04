# Application settings

The header's Settings button opens one native modal for global preferences.
The layout and interaction pattern are adapted from the sibling
`denicheur-breizh/packages/design-system/src/SettingsDialog.tsx`: a section sidebar
on desktop, horizontal section navigation on small screens, and automatic changes.
The port uses local React components and T3 colors without a sibling-repository
runtime dependency.

General contains Appearance (System, Light, Dark) and Language (Browser language,
Español, English, Français). All labels and feedback follow the selected language.
Changes take effect immediately, persist locally, and synchronize across tabs on
the same origin. If storage is blocked, changes still apply to the current page
and the modal reports that they could not be saved.

`ApplicationSettings` owns the entry point and preference adapters.
`SettingsDialog` accepts `SettingsSection[]` with stable IDs, localized titles,
optional descriptions/icons, and React content; use its `sections` prop to add
future groups. Visited sections remain mounted until the dialog closes.
`SettingsRow` connects each native control to its label and description.
Escape, the close button, and backdrop clicks dismiss the dialog; keyboard focus
stays inside while open and returns to the entry button on close.

Appearance is managed by `src/lib/theme.ts`, separate from the settings UI.
`t3-designer.theme` stores explicit `light` or `dark`; System removes the override.
The default and invalid stored values follow `prefers-color-scheme` and respond to
device changes. Initialization before the first React render sets `html[data-theme]`
and native control color scheme. UI theme rules live in `src/theme.css`; scene
materials, sunlight, photographs, and source-document colors keep their original
meaning. Language retains its existing key and detection behavior; see [i18n](i18n.md).

Browser coverage in `apps/web/e2e/settings.spec.ts` verifies keyboard interaction,
dismissal, system appearance, persistence, tab synchronization, unavailable storage,
and mobile layout. The language suites exercise the modal across project views.
