# Public code and private installations

The public repository contains reusable code, an illustrative scene, authored
models, editable Blender sources and a complete static demo. `pnpm dev` and
`pnpm build:demo` require no account, API, analytics service or private network.
The optional backend is open source too, but its users, credentials, generated
private files and operational configuration belong to each installation.

| Public repository | Private installation repository or secret storage |
| --- | --- |
| Demo scene and reviewed public asset catalog | Original property records, diagnostics and unpublished evidence |
| Generic Dockerfiles, local Compose and example environment files | Production endpoints, cluster topology, ingress trust and image promotion |
| Reproducible guides and methodology | Operational reports, deployment evidence and internal runbooks |
| Neutral privacy UI and configuration schema | Operator-specific profile and optional analytics proxy configuration |
| Synthetic fixtures and sanitized captures | Real account exports, invitation links, uploads and generated libraries |

An operator profile is **public at runtime**. Keep its maintained source private
to avoid coupling forks to one installation, but never put passwords, tokens,
private network addresses or confidential records in `site-config.json`.
Store credentials in the installation's secret manager, not either repository.

## Before publishing an asset or change

1. Use example domains, loopback addresses and repository-relative paths in
   reusable instructions. Describe production details in the private repository.
2. Review rights, provenance and visible labels in images and models. Removing
   metadata does not erase visible text or make distinctive geometry anonymous.
3. Run `pnpm audit:public`, `pnpm audit:history` and `pnpm check`. The source audit examines tracked/new files,
   compressed Blender metadata, PNG comments and GLB resource references. The
   build audit also checks `apps/web/dist`. The history audit checks all ancestors
   of the current revision, including removed files and commit metadata, and
   refuses a shallow clone. CI fetches the complete history before running it.
4. Run `pnpm test:demo` when changing routes, configuration, persistence or build
   modes. It verifies the production demo without backend or external requests.
5. Inspect changed screenshots/GIF frames. The automated audit is a set of known
   patterns, not OCR, a complete secret scanner or a guarantee of anonymity.

Historical clones can reintroduce removed information through merge ancestry.
After a history reset, start with a fresh clone and reapply reviewed changes;
do not merge the old history or push old branches/tags to the public repository.
Rewriting a repository cannot erase other people's clones or forks, and hosted
commit caches need separate handling by the hosting provider.
Operator-specific detection terms also belong in private storage, not in public
scanner code or negative test assertions. Use the optional `T3_PRIVACY_POLICY_FILE`
policy for those terms; the source, build and history audits all apply it without
printing matched values.

The [optional pre-push guard](workflows/publication-history.md) also protects
existing linked worktrees from publishing a clean tree with private ancestors.

See [local backend](local-backend.md), [deployment](deployment.md),
[site configuration](site-configuration.md) and [source attribution](reference/evidence.md).
