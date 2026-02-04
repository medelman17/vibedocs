// Re-export ai-elements conversation components
export {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  type ConversationProps,
  type ConversationContentProps,
  type ConversationEmptyStateProps,
  type ConversationScrollButtonProps,
} from "@/components/ai-elements/conversation"

// Re-export ai-elements message components
export {
  Message,
  MessageContent,
  MessageActions,
  MessageAction,
  MessageResponse,
  MessageToolbar,
  type MessageProps,
  type MessageContentProps,
  type MessageActionsProps,
  type MessageActionProps,
  type MessageResponseProps,
  type MessageToolbarProps,
} from "@/components/ai-elements/message"

// Re-export ai-elements suggestion components
export {
  Suggestions,
  Suggestion,
  type SuggestionsProps,
  type SuggestionProps,
} from "@/components/ai-elements/suggestion"

// Re-export ai-elements prompt input components
export {
  PromptInput,
  PromptInputProvider,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputHeader,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionAddAttachments,
  usePromptInputAttachments,
  usePromptInputReferencedSources,
  type PromptInputProps,
  type PromptInputBodyProps,
  type PromptInputTextareaProps,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"

// Slash commands and mentions
export {
  SlashCommands,
  Mentions,
  InputAutocomplete,
  defaultCommands,
  defaultDocuments,
  defaultAnalyses,
  type SlashCommand,
  type Mention,
} from "./slash-commands"
