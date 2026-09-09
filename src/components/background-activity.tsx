import { CollapsibleContent } from "./ui/collapsible"
import { AgentActivityTrace } from "./resume-ai-sidebar"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./ai-elements/reasoning"
import { Conversation, ConversationContent, ConversationScrollButton } from "./ai-elements/conversation"
import { useBackgroundActivity } from "@/lib/background-activity"

export function BackgroundActivityPreview({ taskKey, expandToContent = false }: { taskKey: string; expandToContent?: boolean }) {
  const task = useBackgroundActivity((state) => state.runs[taskKey])
  if (!task) return null
  const running = task.status === "running"
  return <section className="min-w-0 rounded-lg border p-4" aria-label={`${task.title} progress`}>
    <Reasoning isStreaming={running} defaultOpen={false} className="mb-0">
      <ReasoningTrigger type="button" aria-label={`${task.title}: ${running ? "View live reasoning" : "View reasoning"}`} getThinkingMessage={() => <span role="status">{task.title}: {running ? "View live reasoning" : "View reasoning"}</span>} />
      <ReasoningContent>{running ? "Reasoning and activity appear here as the provider sends them." : task.error || (task.activities.length ? "Run finished." : "The provider did not send reasoning or activity for this run.")}</ReasoningContent>
    {task.activities.length > 0 && <CollapsibleContent>{expandToContent ? <div className="mt-3 p-1" role="log">
      <AgentActivityTrace activities={task.activities} isStreaming={running} />
    </div> : <Conversation className="mt-3 h-64">
      <ConversationContent className="gap-3 p-1"><AgentActivityTrace activities={task.activities} isStreaming={running} /></ConversationContent>
      <ConversationScrollButton type="button" />
    </Conversation>}</CollapsibleContent>}
    </Reasoning>
    {task.error && <p role="alert" className="mt-2 text-sm text-destructive">{task.error}</p>}
  </section>
}
