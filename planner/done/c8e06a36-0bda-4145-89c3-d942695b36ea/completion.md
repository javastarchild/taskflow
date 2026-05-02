---
completed: 2026-05-02T08:00:00Z
worker: claude-sonnet-4-6
---

## What Was Done

Added comment input to Active and Completed task detail panels, built ActivityFeedTab with cross-task comment feed (newest first, show more/less, task links), added NavContext for cross-tab task navigation, added comment count badge to Activity tab, and fixed GET /api/tasks + GET /api/done to include comments in list responses.

## Files Changed

- `server/index.js` — GET /api/tasks and GET /api/done now include comments; added POST /api/done/:uuid/comments
- `src/api/client.js` — added addDoneComment
- `src/context/NavContext.js` — created; provides activeTab, focusTask, clearFocus
- `src/context/TaskContext.js` — added addDoneComment action
- `src/components/CommentInput.jsx` + `.css` — created; shared author-selector + textarea input
- `src/components/ActivityFeedTab.jsx` + `.css` — created; full cross-task activity feed
- `src/components/ActiveTasksTab.jsx` — added CommentInput, NavContext focus, new comment badge styles
- `src/components/CompletedTasksTab.jsx` — added CommentInput, NavContext focus, new comment badge styles
- `src/components/ActiveTasksTab.css` — new comment badge styles (planner purple, worker blue)
- `src/components/CompletedTasksTab.css` — same comment badge styles
- `src/App.css` — added .tab-badge style
- `src/App.js` — NavProvider, AppShell pattern, activity count badge

## Notes for Planner

All 5 phases complete. App is fully functional. Both servers must run simultaneously: `npm run server` (port 3001) and `npm start` (port 3000).
