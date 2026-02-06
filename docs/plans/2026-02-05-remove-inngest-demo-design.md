# Remove Inngest Demo Functions

**Date:** 2026-02-05
**Status:** Approved

## Summary

Remove the Inngest demo functions and associated routes/UI. These were scaffolding for testing the Inngest integration and are no longer needed.

## Files to Delete

| File | Purpose |
|---|---|
| `inngest/functions/demo.ts` | `demoProcess` + `demoMultiStep` Inngest functions |
| `app/demo/inngest/page.tsx` | `/demo/inngest` route page |
| `app/demo/inngest/demo-client.tsx` | Client component with demo trigger UI |
| `app/demo/inngest/actions.ts` | Server actions for triggering demo events |

## Files to Edit

| File | Change |
|---|---|
| `inngest/functions/index.ts` | Remove `demoProcess`, `demoMultiStep` from functions array and imports |
| `inngest/types.ts` | Remove `demo/process` and `demo/multi-step` event type definitions |

## Out of Scope

- Bootstrap pipeline (`inngest/functions/bootstrap/`) — still needed for reference data ingestion
- Sample NDAs (`lib/sample-ndas/`) — used in tests
- Admin bootstrap API (`app/api/admin/bootstrap/`) — production admin tooling
