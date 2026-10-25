# Tool step grouping

Approved scope: coalesce adjacent tool-only assistant steps in the Caltra adapter
so assistant-ui's native grouping renders one count and one message container.
Keep Thread components and styling unchanged. No backend schema or deployment changes.

Implementation:
1. Project adjacent tool-only messages through MessageProjection. Preserve text,
   user, empty and interrupted-message boundaries, tool order and source IDs.
2. Preserve each source reasoning resource and adapt both existing disclosures.
3. Cover grouping, lifecycle, lazy detail IDs, reasoning and pagination in adapter
   tests. Add a deterministic `/tools` stub scenario for browser validation.
4. Synchronize source to the existing branch Sprite; run adapter, React and demo
   checks there. Commit validated changes, update the exact preview revision and
   test collapsed/expanded tools, reload, cancellation and a narrow viewport.
5. Share the preview for user acceptance before merging or cleaning up.

The canonical transcript is unchanged. Group IDs stay stable as new steps append;
loading older history can extend a group and select an earlier source ID. Reasoning
text remains lazily fetched, independently of tool grouping. Rollback is a revert
of this adapter change; no stored data migration is required.
