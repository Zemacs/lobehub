import { describe, expect, it, vi } from 'vitest';

import { chatService } from '@/services/chat';
import { messageService } from '@/services/message';

import { createAssistantMessage, createMockStore, createUserMessage } from './fixtures';
import { createInitialState, executeWithMockContext } from './helpers';

vi.mock('@/services/chat', () => ({
  chatService: {
    fetchPresetTaskResult: vi.fn(),
  },
}));

vi.mock('@/services/message', () => ({
  messageService: {
    createCompressionGroup: vi.fn(),
    finalizeCompression: vi.fn(),
  },
}));

vi.mock('@/store/chat/selectors', () => ({
  topicSelectors: {
    currentActiveTopicSummary: vi.fn().mockReturnValue(undefined),
  },
}));

vi.mock('@/store/file/store', () => ({
  getFileStoreState: vi.fn().mockReturnValue({
    uploadBase64FileWithProgress: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {},
}));

vi.mock('@/store/agent/store', () => ({
  getAgentStoreState: vi.fn().mockReturnValue({}),
}));

describe('createAgentExecutors compress_context', () => {
  it('should preserve group context when desktop group compression runs', async () => {
    const agentId = 'agent-123';
    const groupId = 'group-123';
    const topicId = 'topic-123';
    const messageKey = `group_${groupId}_${topicId}`;

    const historyMessage = createUserMessage({ id: 'msg-history', groupId, topicId });
    const assistantMessage = createAssistantMessage({ id: 'msg-assistant', groupId, topicId });
    const followUpMessage = createUserMessage({ id: 'msg-follow-up', groupId, topicId });
    const dbMessages = [historyMessage, assistantMessage, followUpMessage];

    const mockStore = createMockStore({
      dbMessagesMap: {
        [messageKey]: dbMessages,
      },
      replaceMessages: vi.fn(),
    });

    vi.mocked(messageService.createCompressionGroup).mockResolvedValue({
      messageGroupId: 'compression-group-123',
      messages: [
        {
          content: '...',
          groupId,
          id: 'compression-group-123',
          role: 'compressedGroup',
          topicId,
        } as any,
        followUpMessage,
      ],
      messagesToSummarize: [historyMessage, assistantMessage],
    });
    vi.mocked(messageService.finalizeCompression).mockResolvedValue({
      messages: [
        {
          content: 'summary',
          groupId,
          id: 'compression-group-123',
          role: 'compressedGroup',
          topicId,
        } as any,
        followUpMessage,
      ],
    });
    vi.mocked(chatService.fetchPresetTaskResult).mockImplementation(async (params: any) => {
      await params.onMessageHandle?.({ text: 'summary', type: 'text' });
    });

    const state = createInitialState({
      messages: dbMessages,
      modelRuntimeConfig: {
        compressionModel: {
          model: 'gpt-5.5',
          provider: 'openai',
        },
        model: 'gpt-5.5',
        provider: 'openai',
      },
      operationId: 'op-group',
      stepCount: 1,
    });

    const result = await executeWithMockContext({
      context: {
        agentId,
        groupId,
        messageKey,
        operationId: 'op-group',
        parentId: 'msg-parent',
        scope: 'group',
        topicId,
      },
      executor: 'compress_context',
      instruction: {
        payload: {
          currentTokenCount: 1000,
          messages: dbMessages,
        },
        type: 'compress_context',
      },
      mockStore,
      state,
    });

    expect(messageService.createCompressionGroup).toHaveBeenCalledWith({
      agentId,
      groupId,
      messageIds: ['msg-history', 'msg-assistant'],
      threadId: undefined,
      topicId,
    });
    expect(messageService.finalizeCompression).toHaveBeenCalledWith({
      agentId,
      content: 'summary',
      groupId,
      messageGroupId: 'compression-group-123',
      threadId: undefined,
      topicId,
    });
    expect((result.nextContext?.payload as any).compressedMessages).toEqual([
      expect.objectContaining({
        id: 'compression-group-123',
        role: 'compressedGroup',
      }),
      followUpMessage,
    ]);
  });
});
