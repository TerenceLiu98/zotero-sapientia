# Connection and execution state of the sidebar
status-disconnected = Not connected
status-connecting = Connecting…
status-connected = Connected
status-executing = Working…
status-cancelling = Stopping…
status-error = Connection failed

action-connect = Connect
action-disconnect = Disconnect
action-new-conversation = New conversation
action-reconnect = Reconnect
action-restore = Restore conversation
action-send = Send
chat-title = Sapientia
action-close-pane = Close chat
action-agent-settings = Agent settings
action-copy-answer = Copy answer
status-answer-copied = Answer copied
action-open-citation = Open cited PDF
action-open-source = Open source
action-regenerate-answer = Regenerate answer
answer-sources = Sources
answer-source-page = Page { $page }
answer-pdf-source = Zotero PDF
answer-writing = Writing
thinking-running = Thinking
thinking-finished = Finished thinking
thinking-seconds = { $seconds }s
thinking-tool = Tool call
action-stop = Stop

composer-placeholder = Ask your agent…
composer-agent-model = Agent and model
composer-models = Models
composer-models-loading = Loading models…
composer-no-matching-models = No matching models
composer-no-models = No models available
composer-reasoning = Reasoning
composer-search-models = Search models…
context-selection-number = Selected text { $number }
context-selected-items = { $count } selected items
context-add-selection = Ask Agent
context-remove-selection = Remove selection
context-selection-source = { $title }, p. { $page }

# How a turn ended
turn-cancelled = Stopped.
turn-ended-max_tokens = The agent reached its output limit.
turn-ended-max_turn_requests = The agent stopped because it used all of its steps.
turn-ended-refusal = The agent declined to answer.

# Failures, as the sidebar shows them
agent-not-configured = No agent is configured yet. Add one under Settings.
agent-permission-allow-once = Allow once
agent-permission-request = Agent tool request
launch-command-not-found = “{ $command }” was not found. Check the agent’s command, or the PATH of your login shell.
launch-workdir-invalid = The working directory cannot be used: { $path }
process-launch-failed = The agent could not be started.
acp-handshake-timeout = The agent did not answer the ACP handshake in time.
acp-timeout = The agent did not answer { $operation } in time.
acp-protocol-unsupported = The agent speaks ACP version { $agent }, but this plugin speaks version { $client }.
acp-request-failed = The agent reported an error: { $message }
acp-agent-exited = The agent exited with code { $code }.
acp-connection-lost = The agent closed the connection.
acp-stop-timeout = The agent did not stop, so it has been disconnected.
error-unexpected = Something went wrong.

# Settings
prefs-title = Sapientia
prefs-agents = Agents
prefs-no-agent = No agents yet.
prefs-agent-add = Add agent
prefs-agent-name = Name
prefs-agent-command = Command
prefs-agent-args = Arguments
prefs-agent-cwd = Working directory
prefs-agent-env = Environment variables
prefs-env-name = Variable
prefs-env-value = Value
prefs-env-add = Add variable
prefs-agent-save = Save
prefs-agent-cancel = Cancel
prefs-agent-delete = Remove { $name }
prefs-agent-default = Default
prefs-agent-edit = Edit { $name }
prefs-agent-make-default = Make { $name } the default
prefs-agent-reset = Reset { $name } to detected settings
prefs-error-name = Enter a name.
prefs-error-command = Enter a command.
prefs-error-args = Close every quote and remove any trailing backslash.
prefs-error-env = Variable names use letters, digits and underscores, and cannot repeat.
prefs-error-cwd = Enter a valid directory path.
prefs-library-model-heading = Library Agent default
prefs-library-agent-label = Agent
prefs-library-agent-automatic = Automatic
prefs-library-agent-unavailable = Saved agent is unavailable
prefs-library-model-label = Model
prefs-library-model-select-agent = Select an agent
prefs-library-model-choose = Choose a model
prefs-library-model-refresh = Refresh models
prefs-library-model-load-error = Could not load models
library-default-model-unavailable = The default model “{ $model }” is unavailable. Select another model in Settings.
write-review = Review Zotero changes
write-create-note = Create child note
write-edit-note = Edit child note
write-update-metadata = Update bibliographic metadata
write-field-creators = Creators
write-field-item-type = Item type
write-field-before = Previous value
write-field-after = Proposed value
write-field-empty = Empty
write-add-tags = Add tags
write-delete-tags = Remove tags
write-create-collection = Create collection
write-add-to-collection = Add to collection
write-remove-from-collection = Remove from collection
write-report-metadata-unresolved = Unresolved metadata
write-confirm = Approve
write-deny = Deny
write-details = Change details
write-field-item = Item
write-field-note = Note
write-field-content = Content
write-field-tags = Tags
write-field-collection = Collection
write-field-parent-collection = Parent collection
write-field-reason = Reason
write-field-evidence = Evidence
write-change-count = { $count ->
  [one] { $count } change
 *[other] { $count } changes
}
write-risk-low = Low risk
write-risk-medium = Medium risk
write-applying = Applying
write-result-approved = Approved
write-result-denied = Denied
write-result-errors = With errors
write-result-stopped = Stopped
write-cancel = Cancel
write-dismiss = Dismiss
write-history = Write history
write-history-empty = No recorded changes
write-undo = Undo
write-undone = Undone
write-phase-running = Processed { $done } of { $total }
write-phase-stopping = Stopping after the current change
write-phase-completed = Processed { $done } of { $total }
write-phase-cancelled = Cancelled after { $done } of { $total }
write-outcome-applied = Applied
write-outcome-unchanged = No change needed
write-outcome-unresolved = Unresolved
write-outcome-failed = Failed
write-outcome-cancelled = Not processed
write-outcome-waiting = Waiting
permission-title = Agent write access
library-agent = Library Agent
marginalia-settings = Marginalia
marginalia-settings-enable = Show in PDF Reader
marginalia-comment = Annotation comment
marginalia-target-unavailable = The original PDF or annotation is unavailable.
marginalia-target-read-only = Zotero marks this PDF or annotation as read-only.
marginalia-comment-changed = The annotation comment changed while you were editing. Open it again to review the current text.
marginalia-save-failed = Zotero could not save the annotation comment.
marginalia-save-conversation = Save conversation to annotation
marginalia-append-answer = Add answer to annotation
marginalia-user = User
marginalia-agent = Agent
library-new-chat = New chat
library-chats = Chats
library-show-history = Show chat history
library-hide-history = Hide chat history
library-home-title = What are you researching?
library-find-papers = Find papers
library-find-papers-prompt = Find papers in my library about:
library-organize = Organize a collection
library-organize-prompt = Help me organize relevant papers into a collection for:
library-check-metadata = Check metadata
library-check-metadata-prompt = Find papers with missing DOIs and suggest corrections with sources.
library-approval-scope = Preview each batch before applying changes
library-direct = Direct writes
library-direct-scope = Apply changes immediately until Zotero restarts
permission-approval = Request approval
permission-read-only = Read only
permission-heading = How should Zotero writes be approved?
permission-approval-scope = Metadata, notes, and tags · Manual approval
permission-read-only-scope = Current paper · No writes
permission-tag-deletion = Allow tag deletion
permission-tag-deletion-scope = Tags · Manual approval
answer-source-count = { $count ->
  [one] { $count } source
 *[other] { $count } sources
}
answer-source-pages-read = { $count ->
  [one] { $count } page read
 *[other] { $count } pages read
}
answer-open-source = Open source
answer-close-source = Close source preview
answer-copy-quote = Copy quote

marginalia-shortcut-binding = Selection Shortcut
marginalia-shortcut-prompt = Selection Prompt
marginalia-shortcut-record = Press a key combination
marginalia-shortcut-unassigned = Unassigned
marginalia-shortcut-clear = Clear shortcut
marginalia-shortcut-result = Selection result
marginalia-shortcut-running = Waiting for the agent…
marginalia-shortcut-cancel = Cancel request
marginalia-shortcut-close = Close result
marginalia-shortcut-copy = Copy
marginalia-shortcut-add = Add to Annotation
marginalia-shortcut-model-required = Choose a Library Agent model in Sapientia settings.
marginalia-shortcut-no-result = The agent returned no result.
marginalia-shortcut-failed = The selection request failed.

marginalia-reader-toolbar = Marginalia
marginalia-reader-edit = Edit annotation comment
marginalia-reader-edit-action = Edit
marginalia-reader-close = Close comment
marginalia-reader-page = Page { $page }
marginalia-reader-show-comment = Show comment on page { $page }
marginalia-reader-highlight = Highlight
marginalia-reader-underline = Underline
marginalia-reader-expand-card = Expand comment
marginalia-reader-actions = Comment actions
marginalia-reader-ai = AI actions
marginalia-reader-ask = Ask AI
marginalia-reader-ask-action = Ask
marginalia-reader-concise = Make concise
marginalia-reader-polish = Polish
marginalia-reader-expand = Expand
marginalia-reader-character-count =
    { $count ->
        [one] { $count } character
       *[other] { $count } characters
    }
marginalia-reader-model-unavailable = The selected model “{ $model }” is unavailable.
marginalia-reader-rewrite-error = The comment could not be rewritten.
marginalia-reader-comment-changed = The comment changed while you were editing it.
marginalia-reader-save-error = The annotation comment could not be saved.
