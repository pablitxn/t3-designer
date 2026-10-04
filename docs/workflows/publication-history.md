# Publication history guard

A clean checkout does not remove information from earlier commits. Before publishing a revision, run the same privacy rules against every reachable historical blob and commit message:

```sh
node scripts/audit_public_history.mjs
# Or select one branch, commit or annotated tag:
node scripts/audit_public_history.mjs public-release
```

The default is `HEAD`; unrelated local branches are excluded. CI must fetch complete history (`fetch-depth: 0`). Shallow repositories, missing objects, malformed binary data, resource limits, symlinks and submodules fail closed. Git replacement objects and grafts cannot hide ancestors from this check. Output contains paths and finding categories, never matched text or commit messages; paths containing a detected private value are withheld.

The scanner reuses `audit_public_artifacts.mjs`, including compressed Blender metadata, GLB embedded images and PNG metadata. Each historical filename extension is retained, so renaming a file does not hide its previous binary format. Binary decoding runs in a bounded child process. This is a preventive rule check, not proof that arbitrary confidential information or identifying image pixels are absent. Human review and the source/dist artifact audit remain necessary.

## Optional operator policy

Public rules are installation-independent: personal home directories, private IPv4 ranges and external model/application resources. Bare RFC1918 addresses in files named `*.test.*` or `*.spec.*` are allowed for network security fixtures; other rules still apply. The public scanner contains no operator-specific names, hostnames, property identifiers or address lists.

For an installation's additional terms, keep a JSON policy outside the publishable working tree. Administrative storage under the shared Git directory is also accepted. Example policy using deliberately fictional terms:

```json
{
  "version": 1,
  "blockedTerms": ["restricted.example.test", "Fictional Willow Residence"],
  "binaryBlockedTerms": ["fictional-contributor"]
}
```

Set `T3_PRIVACY_POLICY_FILE` to the policy's absolute path when invoking source, build or history audits. CI can inject the policy as a protected file variable of that name. Store its canonical content in the private installation repository or secret storage; do not include it in the public image, build output, reports or CI artifacts.

The schema requires `version` and `blockedTerms`; `binaryBlockedTerms` is optional. No other fields are accepted. It allows at most 64 KiB total and up to 256 literal terms of 3–512 characters per list. Terms use Unicode normalization and case-insensitive matching. Regexes and custom finding labels are rejected. A configured unreadable, malformed or misplaced policy rejects the audit. General blocked terms apply everywhere, including fixtures, historical filenames and decoded binary metadata. Binary-only terms apply to PNG, GLB, Blender, GIF, JPEG and WebP files, including raw residual bytes and supported decoded metadata; they do not prohibit legitimate author attribution in ordinary source and documentation. This checks text in binary files, not identifying image pixels. Reports use fixed categories `operator privacy policy match` and `operator binary privacy policy match` and withhold paths matching either list. Decoder error text is not printed.

The hook below automatically loads `privacy-guard/policy.json` from the common Git directory when present; an explicit `T3_PRIVACY_POLICY_FILE` takes precedence. The scanner takes one policy snapshot per audit and passes it to bounded decoder children, so changing working directories or copying the scanners does not disable the policy.

## Optional local pre-push hook

Install only after reviewing the intended public history. The hook checks all ancestors of every proposed non-deletion tip; it also protects newly created branches and tags. It ignores ref deletions. It can intentionally reject a push whose current tree is clean but whose ancestors are private.

Keep the two scanner modules in the shared Git directory so an older linked worktree cannot accidentally use an older or missing scanner. From the repository root, inspect existing hook configuration first:

```sh
git config --get core.hooksPath || true
git rev-parse --git-common-dir
```

If a custom hook path or existing `pre-push` hook is present, integrate the guard into that hook rather than replacing it. With neither present, this opt-in recipe installs the companion files and hook:

```sh
common_git_dir=$(git rev-parse --git-common-dir)
test ! -e "$common_git_dir/hooks/pre-push" || exit 1
mkdir -p "$common_git_dir/privacy-guard" "$common_git_dir/hooks"
cp scripts/audit_public_history.mjs scripts/audit_public_artifacts.mjs "$common_git_dir/privacy-guard/"
cp scripts/hooks/pre-push "$common_git_dir/hooks/pre-push"
chmod +x "$common_git_dir/hooks/pre-push"
```

Node must be available on the pushing process's `PATH`. Refresh both copied modules together after changing privacy rules. The optional policy is managed separately in private storage. Local hooks can be skipped with Git options or removed, so CI provides an independent check; configure server-side branch protection separately if required. No hook is installed automatically by the application or its build.

Validation fixtures exercise clean current trees with leaked ancestors, metadata, compressed assets renamed later, multiple pushed refs, ignored deletions and a copied hook invoked from another worktree:

```sh
node --test scripts/test/public-history.test.ts
```
