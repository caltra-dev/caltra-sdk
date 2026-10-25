# Stable response turns and viewport inset

Approved after reproducing the anchor mismatch in assistant-ui 0.15.30. The old
tool-only projection alternated between user/assistant and user/assistant/assistant
when a new empty step became a tool call, invalidating and restoring the native
top-anchor reserve. The approved fix preserves upstream Thread and its viewport.

1. Keep consecutive assistant execution steps in one user-delimited UI response,
   starting with the first empty step. Preserve text/tool order and source IDs.
2. Pass authoritative session running state into the response projection so
   completed intermediate steps do not briefly complete the visible response.
3. Keep one packaged CaltraChat Copy action after the last text part; preserve
   lazy tool and reasoning resources. User messages delimit independent responses.
4. Put a 1rem inset on the demo host outside Thread's scrollport, not in the
   upstream Thread source or inside content that native anchoring scrolls away.
5. First reproduce failures in projection/runtime tests, then run adapter, React
   and demo checks on the branch Sprite. Verify the native anchor helper against
   the same event sequence. Commit and update the preview for user acceptance.

No persistence migration is needed. The UI grouping uses existing user-message
boundaries; it does not invent a persisted backend turn ID. Loading an earlier
page may extend the first displayed response, as in the existing projection.
The original transcript and resource authorization remain unchanged.

Browser verification must cover streaming thinking/tools/answer, history reload,
manual scrolling during a run, cancellation and narrow viewports. Browser access
was disabled at implementation start; automated checks do not replace this gate.
Retain the branch and Sprite until visual verification and preview acceptance.
