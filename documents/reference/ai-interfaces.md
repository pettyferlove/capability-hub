# AI HTTP 与 SSE

所有 `/api/ai` 接口要求登录会话，写入还需 CSRF 和 `Idempotency-Key`。不接受 API token 代替工作台会话。所有权、`ai:execute`/`ai:inspect` 与当前资源权限由宿主实时检查。数据 Schema 位于 `packages/contracts/src/ai.ts`。

| 方法与路径                                                        | 输入/结果                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| GET `/api/ai/catalog`                                             | 操作及输入/输出/人工回答 JSON Schema，模型 ID/标签/协议/model；不含 URL 和凭据             |
| POST `/api/ai/executions`                                         | `{operation_id, model_profile?, input}` → 201 执行 DTO、ETag                               |
| GET `/api/ai/executions?limit=30&cursor=…`                        | 当前用户的可读执行，按创建时间和 ID 倒序，`items` / `next_cursor`                          |
| GET `/api/ai/executions/:id`                                      | `{execution, interactions, artifacts, activity, activity_truncated, watermark}`、执行 ETag |
| POST `/api/ai/executions/:id/cancel`                              | `{}`、`If-Match: "<执行 revision>"` → 更新后的执行                                         |
| POST `/api/ai/executions/:id/interactions/:interactionId/respond` | `{response}`、`If-Match: "<交互 revision>"` → 更新后的执行                                 |
| GET `/api/ai/executions/:id/events`                               | SSE，可用 `Last-Event-ID` 或 `cursor` 查询参数续传，header 优先                            |

执行状态、用量、消息块、输入/结果、错误、期限与 revision 均通过显式 DTO 投影。人工回答的 If-Match 是交互修订，不是执行修订；缺失为 428，陈旧为 412，状态冲突为 409，字段错误为 422。重复同一幂等请求返回同一结果，不再生成继续作业。工作台在请求内容和修订不变时保留失败请求的幂等键，避免响应丢失后的重试重复创建任务或继续作业；修改内容或确认成功后使用新键。

`activity` 与执行投影在同一事务读取，是同一执行、operator audience、水位以内的持久事件 envelope，按 seq 升序排列。查询先排除 `message.delta`、`message.completed`、`usage.updated` 和 `execution.completed`，再取最近 1000 条，文本流不会挤掉工具调用。`activity_truncated` 表示更早的活动已省略；消息全文、完成状态、用量与结果由 `execution` 提供，完整人工回答由 `interactions` 提供。客户端校验归属、排序、事件类型和水位；接收后续 SSE 时仅将相同类型的事件加入活动列表并保持上限。活动快照不会改变 seq 或重放游标规则。

## SSE 传输

响应为 `text/event-stream; charset=utf-8`，`Cache-Control: private, no-store, no-transform`，`X-Accel-Buffering: no`。代理必须关闭缓冲。浏览器通过唯一 API 传输模块以 fetch 读取，不额外创建未授权通道。

- 事件 ID：`<execution_id>:operator:<seq>`。seq 从 1 开始，提交后不可修改；快照可以使用 0。游标跨执行或格式错误返回 400。
- 新连接先发 `stream.snapshot`，包含原子视图及 watermark。此前事件已反映在视图中，后续从 watermark + 1 交付。
- 有效游标只重放之后的事件，不重复发送快照。游标超过服务端水位或历史存在缺口时发 `stream.reset`，客户端用新视图整体替换。
- `stream.snapshot` / `stream.reset` 的 data 为 `{schema_version:1, execution, interactions, artifacts, activity, activity_truncated, watermark}`；它们不是持久事件，不额外占 seq。
- 每 15 秒发 `: heartbeat` 注释。单连接最长 5 分钟，每用户每进程最多 4 条连接。背压时结束当前连接，由客户端按最后处理成功的游标恢复。
- 等待人工或终态且事件已追平时关闭连接。客户端再 GET 最新视图取得完整交互和成果，提交回答后重新连接。网络断开不等于取消。
- 每轮推送在同一事务内重查会话、账号与资源权限并读取该批事件，失败发 `stream.error`：`{schema_version:1,code:"ACCESS_REVOKED"|"STREAM_UNAVAILABLE"}` 并关闭。此控制帧无 id。`ACCESS_REVOKED` 清空当前视图并停止连接；`STREAM_UNAVAILABLE` 保留已读视图与游标并退避重连，连续五次无进展失败后提示重新打开执行。

持久事件 envelope：

```json
{
  "schema_version": 1,
  "execution_id": "uuid",
  "audience": "operator",
  "seq": 8,
  "type": "message.delta",
  "attempt": 1,
  "continuation": 0,
  "occurred_at": "2026-10-31T00:00:00.000Z",
  "data": {
    "message_id": "agent:invocation",
    "block_id": "agent:invocation:text",
    "offset": 0,
    "delta": "你好"
  }
}
```

`event:` 与 type 一致，`id:` 与 execution/audience/seq 一致。attempt 表示调度认领次数，continuation 表示已受理的人工继续次数；重连不会增加它们。客户端忽略已处理 seq，序号或偏移断档时请求新快照。

## 持久事件负载

| type                                                              | data                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| execution.queued                                                  | 首次 `{operation_id}`，人工继续 `{continuation}`               |
| execution.started / execution.waiting_input / execution.cancelled | `{}`                                                           |
| execution.completed                                               | `{result}`                                                     |
| execution.failed / execution.timed_out                            | `{error:{code,message,retryable}}`                             |
| execution.retry_scheduled                                         | `{reason:"interrupted"}`                                       |
| step.started                                                      | `{step_id}`                                                    |
| step.completed                                                    | `{step_id,duration_ms}`                                        |
| step.failed                                                       | `{step_id,code}`                                               |
| message.started                                                   | `{message_id,block_id,format:"text"}`                          |
| message.delta                                                     | `{message_id,block_id,offset,delta}`                           |
| message.completed                                                 | `{message_id,block_id,length}`                                 |
| tool.started / tool.completed                                     | `{tool_id,invocation_id}`                                      |
| tool.failed                                                       | `{tool_id,invocation_id,code}`                                 |
| interaction.requested                                             | `{interaction_id,request,response_schema,revision}`            |
| interaction.responded                                             | `{interaction_id}`                                             |
| usage.updated                                                     | `{requests,tools,input_tokens,output_tokens,unknown_requests}` |
| artifact.created                                                  | `{artifact_id,name,media_type}`                                |

文本 offset 和 length 以 JavaScript UTF-16 code unit 计数，客户端必须使用字符串 `.length`，不能使用字节数或 Unicode 码点数。多个并行 Agent 使用独立 message/block ID，不能把它们当作同一文本流。普通增量按 4 KiB 或 50 ms 合并后持久化，未落盘文本不会对 UI 发布。

SSE 不透传原生 SDK 事件、原始请求、工具参数/结果、凭据或内部推理文本。正式 JSON 结果和成果只在显式投影中交付。
