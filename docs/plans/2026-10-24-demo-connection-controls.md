# Signal Room connection and composer controls

Keep Local stub available and expose Real Caltra API automatically when the Vite
server has an API key. Preserve real-by-default when launched with a key and the
explicit `--local-stub` isolation override. Mount the stub at `/demo/stub`, leaving
the existing origin-checked real proxy routes unchanged. Expose only availability
and default connection to browser code. Remount the client/session tree on change
to isolate tokens, streams, drafts, and selected sessions; keep the selector usable
during loading and authentication failures.

Move the native assistant-ui ModelSelector into Standard Thread's composer through
a narrow demo-owned ComposerControls slot. Keep its state above the two chat views
so changing presentation preserves selection and its native ModelContext behavior.
Keep the header control in CaltraChat. Preserve the managed Thread and composer.

Verify the combined proxy and stub with the real SDK against a mock upstream,
including credentials/origin isolation and absent-key behavior. Run demo checks on
the existing branch Sprite, then use the browser extension to verify both chat
views, composer selection, responsive layout, connection switching and recovery.
Commit and provide the updated preview for user acceptance before merging.

## Stock selector presentation

User requested removing all selector styling overrides. Remove custom trigger and
menu classes and the always-visible explanatory copy. Retain stock upstream
markup, default variants/sizes, ModelContext registration and allowed choices.
Mount the popup within the owning theme scope so standard Tailwind reset and theme
tokens apply in both views. Check light/dark, keyboard selection and mobile width
on the private Sprite before committing and handing off the preview.

Stock-presentation verification: package/demo builds, demo type checking and all
14 demo tests passed on the branch Sprite after rebasing onto the server SDK
0.9.0 release. Visual validation remains pending: the browser extension timed
out on the existing tab, a new tab, and surface inventory. Keep this change
unmerged until visual validation and user acceptance are complete.
