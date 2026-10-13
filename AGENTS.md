<a id="base-de-conocimiento-compartida"></a>

## Shared knowledge base

When a request needs context, reading, sources, relationships, owners, decisions,
or project, app or repository status in the ecosystem, use Atlas as a navigation
guide even if the request does not mention it. Resolve `KB_ROOT` from this
project's Git root, using `../sysadmin-workspace` only if that relative mount
exists in the session and points to the expected repository. Verify
`KB_ROOT/AGENTS.md`, `KB_ROOT/atlas/AGENTS.md` and `KB_ROOT/atlas/catalog/` before
trusting that path.

Read those instructions and the relevant skill before working:

- For context, reading, sources, relationships, owners or project status:
  open and read `KB_ROOT/.agents/skills/atlas-navigate/SKILL.md`.
- For a requested KB update or reconciliation: open and read
  `KB_ROOT/.agents/skills/atlas-maintain/SKILL.md`.

If the skill is absent from the native catalog, open and read the file
explicitly; this pointer does not automatically include its contents. A sibling
or co-mounted repository does not guarantee native registration. If access is
missing, report the limit without creating mounts or installing copies. Skill
scope is an instruction: environmental permissions and the current mandate
govern actions. A KB request does not authorize changes to other repositories,
Notion or runtime.

## Language and commits

Canonical policy: [Engineering Language and Commit Directive](https://github.com/pablitxn/sysadmin-workspace/blob/35be24cdef1275a3d850c9ccb999e11c3ffe6609/atlas/ops/standards/engineering-language-and-commits.md),
verified at `35be24cdef1275a3d850c9ccb999e11c3ffe6609` in Atlas draft PR5.
This is a pending upstream dependency, not merged main or guaranteed mounted
content. Use the concise fallback below if unavailable; do not install copies.

- Write repository-authored technical prose in English: instructions, docs,
  comments, test descriptions, and new pull-request titles and bodies.
- Preserve API identifiers/contracts, localized product copy, fixture inputs,
  external names, original source quotations and historical evidence. Classify
  ambiguous exceptions explicitly in the audit report; do not translate blindly.
- Use English Conventional Commits for all new commits:
  `type(scope): description` (for example, `docs(qa): translate audit reports`).
  Do not rewrite published history or force push to enforce this rule.
- Run the existing validation commands appropriate to the change. The local
  `pnpm audit:english` check detects selected Spanish technical phrases; it is
  not a language guarantee. Human review must assess meaning, exceptions,
  quotations, test inputs and remote PR prose. Record executable checks and their
  limits, pre-existing failures and remaining gaps in an English audit report.
- Keep language edits scoped and preserve behavior. Do not relax validation gates
  or change branch protection, credentials or security settings for this work.
