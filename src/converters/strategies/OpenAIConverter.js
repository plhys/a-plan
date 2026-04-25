/**
 * OpenAI转换器
 * 处理OpenAI协议与其他协议之间的转换
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import { BaseConverter } from '../BaseConverter.js';
import {
    extractAndProcessSystemMessages as extractSystemMessages,
    extractTextFromMessageContent as extractText,
} from '../utils.js';
import { MODEL_PROTOCOL_PREFIX } from '../../utils/common.js';
import {
    generateResponseCreated,
    generateResponseInProgress,
    generateOutputItemAdded,
    generateContentPartAdded,
    generateOutputTextDone,
    generateContentPartDone,
    generateOutputItemDone,
    generateResponseCompleted
} from '../../providers/openai/openai-responses-core.mjs';

/**
 * OpenAI转换器类
 * 实现OpenAI协议到其他协议的转换
 */
export class OpenAIConverter extends BaseConverter {
    constructor() {
        super('openai');
    }

    /**
     * 转换请求
     */
    convertRequest(data, targetProtocol) {
        switch (targetProtocol) {
            case MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES:
                return this.toOpenAIResponsesRequest(data);
            case MODEL_PROTOCOL_PREFIX.CLOUDFLARE:
                // Cloudflare Gateway 使用 OpenAI 格式，无需转换
                return data;
            default:
                throw new Error(`Unsupported target protocol: ${targetProtocol}`);
        }
    }

    /**

         * 转换响应

         */

        convertResponse(data, targetProtocol, model) {

            // OpenAI 作为源格式时，通常不需要转换响应

            // 因为其他协议会转换到 OpenAI 格式

        switch (targetProtocol) {
            case MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES:
                return this.toOpenAIResponsesResponse(data, model);
            case MODEL_PROTOCOL_PREFIX.CLOUDFLARE:
            case MODEL_PROTOCOL_PREFIX.OPENAI:
                // OpenAI/Cloudflare Gateway 使用 OpenAI 格式，无需转换
                return data;
            default:
                throw new Error(`Unsupported target protocol: ${targetProtocol}`);
        }

        }

    /**
     * 转换流式响应块
     */
    convertStreamChunk(chunk, targetProtocol, model) {
        switch (targetProtocol) {
            case MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES:
                return this.toOpenAIResponsesStreamChunk(chunk, model);
            case MODEL_PROTOCOL_PREFIX.CLOUDFLARE:
            case MODEL_PROTOCOL_PREFIX.OPENAI:
                // OpenAI/Cloudflare Gateway 使用 OpenAI 格式，无需转换
                return chunk;
            default:
                throw new Error(`Unsupported target protocol: ${targetProtocol}`);
        }
    }

    /**
     * 转换模型列表
     */
    convertModelList(data, targetProtocol) {
        return this.ensureDisplayName(data);
    }

    /**
     * Ensure display_name field exists in OpenAI model list
     */
    ensureDisplayName(openaiModels) {
        if (!openaiModels || !openaiModels.data) {
            return openaiModels;
        }

        return {
            ...openaiModels,
            data: openaiModels.data.map(model => ({
                ...model,
                display_name: model.display_name || model.id,
            })),
        };
    }

    // =========================================================================
    // OpenAI -> Claude 转换
    // =========================================================================

    /**
     * OpenAI请求 -> Claude请求
    toOpenAIResponsesRequest(openaiRequest) {
        const responsesRequest = {
            model: openaiRequest.model,
            instructions: '',
            input: [],
            stream: openaiRequest.stream || false,
            max_output_tokens: openaiRequest.max_tokens,
            temperature: openaiRequest.temperature,
            top_p: openaiRequest.top_p,
            parallel_tool_calls: openaiRequest.parallel_tool_calls,
            tool_choice: openaiRequest.tool_choice
        };

        const { systemInstruction, nonSystemMessages } = extractSystemMessages(openaiRequest.messages || []);

        if (systemInstruction) {
            responsesRequest.instructions = extractText(systemInstruction.parts[0].text);
        }

        if (openaiRequest.reasoning_effort) {
            responsesRequest.reasoning = {
                effort: openaiRequest.reasoning_effort
            };
        }

        // 转换messages到input
        for (const msg of nonSystemMessages) {
            if (msg.role === 'tool') {
                responsesRequest.input.push({
                    type: 'function_call_output',
                    call_id: msg.tool_call_id,
                    output: msg.content
                });
            } else if (msg.role === 'assistant' && msg.tool_calls?.length) {
                for (const tc of msg.tool_calls) {
                    responsesRequest.input.push({
                        type: 'function_call',
                        call_id: tc.id,
                        name: tc.function.name,
                        arguments: tc.function.arguments
                    });
                }
            } else {
                let content = [];
                if (typeof msg.content === 'string') {
                    content.push({
                        type: msg.role === 'assistant' ? 'output_text' : 'input_text',
                        text: msg.content
                    });
                } else if (Array.isArray(msg.content)) {
                    msg.content.forEach(c => {
                        if (c.type === 'text') {
                            content.push({
                                type: msg.role === 'assistant' ? 'output_text' : 'input_text',
                                text: c.text
                            });
                        } else if (c.type === 'image_url') {
                            content.push({
                                type: 'input_image',
                                image_url: c.image_url
                            });
                        }
                    });
                }

                if (content.length > 0) {
                    responsesRequest.input.push({
                        type: 'message',
                        role: msg.role,
                        content: content
                    });
                }
            }
        }

        // 处理工具
        if (openaiRequest.tools) {
            responsesRequest.tools = openaiRequest.tools.map(t => ({
                type: t.type || 'function',
                name: t.function?.name,
                description: t.function?.description,
                parameters: t.function?.parameters
            }));
        }

        return responsesRequest;
    }

    /**
     * 将OpenAI响应转换为OpenAI Responses格式
     */
    toOpenAIResponsesResponse(openaiResponse, model) {
        if (!openaiResponse || !openaiResponse.choices || !openaiResponse.choices[0]) {
            return {
                id: `resp_${Date.now()}`,
                object: 'response',
                created_at: Math.floor(Date.now() / 1000),
                status: 'completed',
                model: model || 'unknown',
                output: [],
                usage: {
                    input_tokens: 0,
                    output_tokens: 0,
                    total_tokens: 0
                }
            };
        }

        const choice = openaiResponse.choices[0];
        const message = choice.message || {};
        const output = [];

        // 构建message输出
        const messageContent = [];
        if (message.content) {
            messageContent.push({
                type: 'output_text',
                text: message.content
            });
        }

        output.push({
            type: 'message',
            id: `msg_${Date.now()}`,
            status: 'completed',
            role: 'assistant',
            content: messageContent
        });

        // Handle tool calls (function_call output items)
        if (message.tool_calls && message.tool_calls.length > 0) {
            for (const tc of message.tool_calls) {
                if (tc.type === 'function' && tc.function) {
                    output.push({
                        type: 'function_call',
                        id: tc.id || `fc_${Date.now()}`,
                        call_id: tc.id || `call_${Date.now()}`,
                        name: tc.function.name,
                        arguments: tc.function.arguments || '{}',
                        status: 'completed'
                    });
                }
            }
        }

        const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;

        return {
            id: openaiResponse.id || `resp_${Date.now()}`,
            object: 'response',
            created_at: openaiResponse.created || Math.floor(Date.now() / 1000),
            status: hasToolCalls ? 'requires_action' : (choice.finish_reason === 'stop' ? 'completed' : 'in_progress'),
            model: model || openaiResponse.model || 'unknown',
            output: output,
            usage: openaiResponse.usage ? {
                input_tokens: openaiResponse.usage.prompt_tokens || 0,
                input_tokens_details: {
                    cached_tokens: openaiResponse.usage.prompt_tokens_details?.cached_tokens || 0
                },
                output_tokens: openaiResponse.usage.completion_tokens || 0,
                output_tokens_details: {
                    reasoning_tokens: openaiResponse.usage.completion_tokens_details?.reasoning_tokens || 0
                },
                total_tokens: openaiResponse.usage.total_tokens || 0
            } : {
                input_tokens: 0,
                input_tokens_details: {
                    cached_tokens: 0
                },
                output_tokens: 0,
                output_tokens_details: {
                    reasoning_tokens: 0
                },
                total_tokens: 0
            }
        };
    }

    /**
     * 将OpenAI流式响应转换为OpenAI Responses流式格式
     * 参考 ClaudeConverter.toOpenAIResponsesStreamChunk 的实现逻辑
     */
    toOpenAIResponsesStreamChunk(openaiChunk, model, requestId = null) {
        if (!openaiChunk || !openaiChunk.choices || !openaiChunk.choices[0]) {
            return [];
        }

        const responseId = requestId || `resp_${uuidv4().replace(/-/g, '')}`;
        const choice = openaiChunk.choices[0];
        const delta = choice.delta || {};
        const events = [];

        // 第一个chunk - role为assistant时调用 getOpenAIResponsesStreamChunkBegin
        if (delta.role === 'assistant') {
            events.push(
                generateResponseCreated(responseId, model || openaiChunk.model || 'unknown'),
                generateResponseInProgress(responseId),
                generateOutputItemAdded(responseId),
                generateContentPartAdded(responseId)
            );
        }

        // 处理 reasoning_content（推理内容）
        if (delta.reasoning_content) {
            events.push({
                delta: delta.reasoning_content,
                item_id: `thinking_${uuidv4().replace(/-/g, '')}`,
                output_index: 0,
                sequence_number: 3,
                type: "response.reasoning_summary_text.delta"
            });
        }

        // 处理 tool_calls（工具调用）
        if (delta.tool_calls && delta.tool_calls.length > 0) {
            for (const toolCall of delta.tool_calls) {
                const outputIndex = toolCall.index || 0;

                // 如果有 function.name，说明是工具调用开始
                if (toolCall.function && toolCall.function.name) {
                    events.push({
                        item: {
                            id: toolCall.id || `call_${uuidv4().replace(/-/g, '')}`,
                            type: "function_call",
                            name: toolCall.function.name,
                            arguments: "",
                            status: "in_progress"
                        },
                        output_index: outputIndex,
                        sequence_number: 2,
                        type: "response.output_item.added"
                    });
                }

                // 如果有 function.arguments，说明是参数增量
                if (toolCall.function && toolCall.function.arguments) {
                    events.push({
                        delta: toolCall.function.arguments,
                        item_id: toolCall.id || `call_${uuidv4().replace(/-/g, '')}`,
                        output_index: outputIndex,
                        sequence_number: 3,
                        type: "response.function_call_arguments.delta"
                    });
                }
            }
        }

        // 处理普通文本内容
        if (delta.content) {
            events.push({
                delta: delta.content,
                item_id: `msg_${uuidv4().replace(/-/g, '')}`,
                output_index: 0,
                sequence_number: 3,
                type: "response.output_text.delta"
            });
        }

        // 处理完成状态 - 调用 getOpenAIResponsesStreamChunkEnd
        if (choice.finish_reason) {
            events.push(
                generateOutputTextDone(responseId),
                generateContentPartDone(responseId),
                generateOutputItemDone(responseId),
                generateResponseCompleted(responseId)
            );

            // 如果有 usage 信息，更新最后一个事件
            if (openaiChunk.usage && events.length > 0) {
                const lastEvent = events[events.length - 1];
                if (lastEvent.response) {
                    lastEvent.response.usage = {
                        input_tokens: openaiChunk.usage.prompt_tokens || 0,
                        input_tokens_details: {
                            cached_tokens: openaiChunk.usage.prompt_tokens_details?.cached_tokens || 0
                        },
                        output_tokens: openaiChunk.usage.completion_tokens || 0,
                        output_tokens_details: {
                            reasoning_tokens: openaiChunk.usage.completion_tokens_details?.reasoning_tokens || 0
                        },
                        total_tokens: openaiChunk.usage.total_tokens || 0
                    };
                }
            }
        }

        return events;
    }

}

export default OpenAIConverter;
