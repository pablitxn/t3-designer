export const workspaceViews = ['apartment', 'building', 'documentation', 'assets', 'walkthrough'] as const
export type WorkspaceView = typeof workspaceViews[number]

export function workspaceFromHash(hash: string): WorkspaceView {
  const value = hash.replace(/^#/, '')
  return workspaceViews.find(view => view === value) ?? 'building'
}
