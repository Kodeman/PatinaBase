# Permissions justification — Patina Capture

Reviewer-facing text, one paragraph per manifest permission
(`apps/extension/package.json` `manifest.permissions` and
`manifest.host_permissions`). Each paragraph is written for the CWS
dashboard's per-permission justification fields — first person plural,
factual, no marketing language, each citing the code path that uses it.
Keep to ≤90 words each; all are under that limit.

## activeTab

We use `activeTab` so Patina Capture can read the page a designer is
currently looking at, but only after they explicitly invoke the extension —
by clicking the toolbar icon, pressing the capture shortcut
(`chrome.commands.onCommand`, `src/background.ts:443-450`), or choosing a
context-menu entry (`src/background.ts:487-496`). Each of those handlers
queries the active tab (`chrome.tabs.query({ active: true, currentWindow:
true })`) at the moment of the user's action, not on a timer or in the
background. We never request access to tabs the designer hasn't chosen to
capture.

## scripting

We use `scripting` to inject the extraction logic into the active tab when
the content script hasn't already loaded there — the fallback path in
`chrome.scripting.executeScript` at `src/hooks/use-capture-controller.ts:278`.
The primary path is a declared content script
(`src/contents/extractor.ts`) that reads product fields (name, price,
images, dimensions) from the page DOM. `scripting` lets us reach pages where
the declared content script missed the initial load, without asking for
broader script-injection rights than the single active-tab capture needs.

## storage

We use `storage` for two things scoped to the extension's own local/session
storage, never synced or shared: (1) `chrome.storage.session`, to hand the
designer's chosen capture intent (page, image, or text selection) from the
background service worker to the side panel when it opens
(`setPendingIntent`, `src/background.ts:479-485`); and (2)
`chrome.storage.local`, via the Supabase session adapter
(`src/lib/chrome-storage-adapter.ts`), to keep the designer signed in
between panel opens without re-authenticating every capture.

## contextMenus

We use `contextMenus` to add three entries a designer can right-click to
start a capture without opening the panel first: "Capture page with
Patina," "Capture this image," and "Capture selection as product"
(`chrome.contextMenus.create`, `src/background.ts:461-464`). Choosing one
sets the capture intent for that specific page, image, or selection
(`src/background.ts:488-496`) and opens the side panel already pointed at
it. No other use of the context-menu surface exists in the extension.

## sidePanel

We use `sidePanel` because the capture UI itself is Chrome's side panel, not
a popup — `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true
})` and `chrome.sidePanel.open({ tabId })` (`src/background.ts:457-458,
449, 497`) are how the extension opens that UI, whether triggered by the
toolbar icon, the keyboard shortcut, or a context-menu choice. The panel is
where a designer reviews extracted fields and confirms the save; without
`sidePanel` the extension has no interface.

## alarms

We use `alarms` for one recurring task: refreshing the designer's Supabase
auth session on a timer so a long-open side panel doesn't go stale
mid-session — `chrome.alarms.create('refresh-token', { periodInMinutes: 30
})` (`src/background.ts:519`), handled in the alarm listener at
`src/background.ts:521`. This is local token housekeeping only; it doesn't
wake the extension to read pages or send any capture-related network
request on its own.

## cookies

We use `cookies`, scoped in practice to `app.patina.cloud`, to read the
designer's existing portal sign-in session so the side panel can adopt it
without asking them to sign in twice. `readPortalSessionTokens`
(`src/lib/portal-cookie.ts:134-137`) calls `chrome.cookies.getAll({ url:
PORTAL_URL })` — `PORTAL_URL` is the designer portal's own origin — decodes
the Supabase auth-token cookie (which the portal's `@supabase/ssr` client
writes, chunked and base64url-encoded), and hands the access/refresh token
pair to the extension's own Supabase client. No other site's cookies are
read.

## Host permission: `https://*/*`

We request `https://*/*` because the extraction content script
(`src/contents/extractor.ts:11-14`, `matches: ['https://*/*', 'http://*/*']`)
must run on whatever vendor page a designer sources from — furniture and
home-goods vendors span thousands of independent domains (national
retailers, individual manufacturers, small workshops) — a fixed host list
would fail exactly the long-tail maker sites this tool exists to help
designers capture from. The content script reads a page's fields only when
the designer triggers a capture on that tab (see `activeTab` above);
installing the extension grants no standing background access to any site.

Note: the manifest currently also declares `http://*/*` alongside
`https://*/*`. That is being dropped in W2 (`W2-E8`, manifest cleanup) —
Patina Capture has no legitimate need to run on unencrypted vendor pages —
and is independent of the `https://*/*` justification above.
