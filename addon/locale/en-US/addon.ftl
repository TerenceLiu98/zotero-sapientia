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
action-stop = Stop

composer-placeholder = Ask your agent…

# How a turn ended
turn-cancelled = Stopped.
turn-ended-max_tokens = The agent reached its output limit.
turn-ended-max_turn_requests = The agent stopped because it used all of its steps.
turn-ended-refusal = The agent declined to answer.

# Failures, as the sidebar shows them
agent-not-configured = No agent is configured yet. Add one under Settings.
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
prefs-title = Zotero ACP Agent
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
prefs-default-agent = Default agent
prefs-default-placeholder = Choose an agent…
prefs-combobox-empty = No matching agent
prefs-error-name = Enter a name.
prefs-error-command = Enter a command.
prefs-error-args = Close every quote and remove any trailing backslash.
prefs-error-env = Variable names use letters, digits and underscores, and cannot repeat.
prefs-error-cwd = Enter a valid directory path.
