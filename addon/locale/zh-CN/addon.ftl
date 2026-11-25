# 侧边栏的连接与执行状态
status-disconnected = 未连接
status-connecting = 正在连接…
status-connected = 已连接
status-executing = 执行中…
status-cancelling = 正在停止…
status-error = 连接失败

action-connect = 连接
action-disconnect = 断开连接
action-new-conversation = 新建对话
action-reconnect = 重新连接
action-restore = 恢复对话
action-send = 发送
chat-title = Sapientia
action-close-pane = 关闭侧栏
action-agent-settings = Agent 设置
action-copy-answer = 复制回答
status-answer-copied = 已复制回答
action-open-citation = 打开引用的 PDF
action-stop = 停止

composer-placeholder = 向你的 Agent 提问…

# 回合的结束方式
turn-cancelled = 已停止。
turn-ended-max_tokens = Agent 已达到输出长度上限。
turn-ended-max_turn_requests = Agent 已用完全部步骤，因此停止。
turn-ended-refusal = Agent 拒绝回答。

# 侧边栏显示的失败信息
agent-not-configured = 尚未配置 Agent，请先在设置中添加。
launch-command-not-found = 找不到“{ $command }”。请检查 Agent 的命令，或登录 shell 的 PATH。
launch-workdir-invalid = 无法使用该工作目录：{ $path }
process-launch-failed = 无法启动 Agent。
acp-handshake-timeout = Agent 未在限定时间内完成 ACP 握手。
acp-timeout = Agent 未在限定时间内回应 { $operation }。
acp-protocol-unsupported = Agent 使用 ACP 版本 { $agent }，而本插件使用版本 { $client }。
acp-request-failed = Agent 返回了错误：{ $message }
acp-agent-exited = Agent 已退出，退出码为 { $code }。
acp-connection-lost = Agent 关闭了连接。
acp-stop-timeout = Agent 没有停止，已断开连接。
error-unexpected = 出了点问题。

# 设置
prefs-title = Zotero ACP Agent
prefs-agents = Agent
prefs-no-agent = 还没有 Agent。
prefs-agent-add = 添加 Agent
prefs-agent-name = 名称
prefs-agent-command = 命令
prefs-agent-args = 参数
prefs-agent-cwd = 工作目录
prefs-agent-env = 环境变量
prefs-env-name = 变量名
prefs-env-value = 值
prefs-env-add = 添加变量
prefs-agent-save = 保存
prefs-agent-cancel = 取消
prefs-agent-delete = 移除 { $name }
prefs-default-agent = 默认 Agent
prefs-default-placeholder = 选择一个 Agent…
prefs-combobox-empty = 没有匹配的 Agent
prefs-error-name = 请输入名称。
prefs-error-command = 请输入命令。
prefs-error-args = 引号未成对闭合，或末尾有多余的反斜杠。
prefs-error-env = 变量名只能使用字母、数字和下划线，且不能重复。
prefs-error-cwd = 请输入有效的目录路径。
