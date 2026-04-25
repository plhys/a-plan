/**
 * OpenAI Responses API 转换器
 * 处理 OpenAI Responses API 格式与 OpenAI 格式之间的转换
 */

import { BaseConverter } from '../BaseConverter.js';
import { MODEL_PROTOCOL_PREFIX } from '../../utils/common.js';

/**
 * OpenAI Responses API 转换器类
 */
export class OpenAIResponsesConverter extends BaseConverter {
    constructor() {
        super(MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES);
    }

    // =============================================================================
    // 请求转换
    // =============================================================================

    convertRequest(data, toProtocol) {
        switch (toProtocol) {
            case MODEL_PROTOCOL_PREFIX.OPENAI:
                return this.toOpenAIRequest(data);
            default:
                throw new Error(`Unsupported target protocol: ${toProtocol}`);
        }
    }

    convertResponse(data, toProtocol, model) {
        switch (toProtocol) {
            case MODEL_PROTOCOL_PREFIX.OPENAI:
                return this.toOpenAIResponse(data, model);
            default:
                throw new Error(`Unsupported target protocol: ${toProtocol}`);
        }
    }

    convertStreamChunk(chunk, toProtocol, model) {
        switch (toProtocol) {
            case MODEL_PROTOCOL_PREFIX.OPENAI:
                return this.toOpenAIStreamChunk(chunk, model);
            default:
                throw new Error(`Unsupported target protocol: ${toProtocol}`);
        }
    }

    convertModelList(data, targetProtocol) {
        switch (targetProtocol) {
            case MODEL_PROTOCOL_PREFIX.OPENAI:
                return this.toOpenAIModelList(data);
            default:
                return data;
        }
    }

    // =============================================================================
    // 转换到 OpenAI 格式
    // =============================================================================

    toOpenAIRequest(responsesRequest) {
        const openaiRequest = {
            model: responsesRequest.model,
            messages: [],
            stream: responsesRequest.stream || false
        };

        if (responsesRequest.temperature !== undefined) {
            openaiRequest.temperature = responsesRequest.temperature;
        }
        if (responsesRequest.max_output_tokens !== undefined) {
            openaiRequest.max_tokens = responsesRequest.max_output_tokens;
        } else if (responsesRequest.max_tokens !== undefined) {
            openaiRequest.max_tokens = responsesRequest.max_tokens;
        }
        if (responsesRequest.top_p !== undefined) {
            openaiRequest.top_p = responsesRequest.top_p;
        }
        if (responsesRequest.parallel_tool_calls !== undefined) {
            openaiRequest.parallel_tool_calls = responsesRequest.parallel_tool_calls;
        }

        if (responsesRequest.instructions) {
            openaiRequest.messages.push({
                role: 'system',
                content: responsesRequest.instructions
            });
        }

        if (responsesRequest.input && Array.isArray(responsesRequest.input)) {
            responsesRequest.input.forEach(item => {
                const itemType = item.type || (item.role ? 'message' : '');

                switch (itemType) {
                    case 'message':
                        let content = '';
                        if (Array.isArray(item.content)) {
                            content = item.content
                                .filter(c => c.type === 'input_text' || c.type === 'output_text')
                                .map(c => c.text)
                                .join('\n');
                        } else if (typeof item.content === 'string') {
                            content = item.content;
                        }

                        if (content || (item.role === 'assistant' || item.role === 'developer')) {
                            openaiRequest.messages.push({
                                role: item.role === 'developer' ? 'assistant' : item.role,
                                content: content
                            });
                        }
                        break;

                    case 'function_call':
                        openaiRequest.messages.push({
                            role: 'assistant',
                            tool_calls: [{
                                id: item.call_id,
                                type: 'function',
                                function: {
                                    name: item.name,
                                    arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments)
                                }
                            }]
                        });
                        break;

                    case 'function_call_output':
                        openaiRequest.messages.push({
                            role: 'tool',
                            tool_call_id: item.call_id,
                            content: item.output
                        });
                        break;
                }
            });
        }

        if (responsesRequest.messages && Array.isArray(responsesRequest.messages)) {
            responsesRequest.messages.forEach(msg => {
                openaiRequest.messages.push({
                    role: msg.role,
                    content: msg.content
                });
            });
        }

        if (responsesRequest.tools && Array.isArray(responsesRequest.tools)) {
            openaiRequest.tools = responsesRequest.tools
                .map(tool => {
                    if (tool.type && tool.type !== 'function') {
                        return null;
                    }

                    const name = tool.name || (tool.function && tool.function.name);
                    const description = tool.description || (tool.function && tool.function.description);
                    const parameters = tool.parameters || (tool.function && tool.function.parameters) || tool.parametersJsonSchema || { type: 'object', properties: {} };

                    if (!name) {
                        return null;
                    }

                    return {
                        type: 'function',
                        function: {
                            name: name,
                            description: description,
                            parameters: parameters
                        }
                    };
                })
                .filter(tool => tool !== null);
        }

        if (responsesRequest.tool_choice) {
            openaiRequest.tool_choice = responsesRequest.tool_choice;
        }

        return openaiRequest;
    }

    toOpenAIResponse(responsesResponse, model) {
        const choices = [];
        let usage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            prompt_tokens_details: { cached_tokens: 0 },
            completion_tokens_details: { reasoning_tokens: 0 }
        };

        if (responsesResponse.output && Array.isArray(responsesResponse.output)) {
            responsesResponse.output.forEach((item, index) => {
                if (item.type === 'message') {
                    const content = item.content
                        ?.filter(c => c.type === 'output_text')
                        .map(c => c.text)
                        .join('') || '';

                    choices.push({
                        index: index,
                        message: {
                            role: 'assistant',
                            content: content
                        },
                        finish_reason: responsesResponse.status === 'completed' ? 'stop' : null
                    });
                } else if (item.type === 'function_call') {
                    choices.push({
                        index: index,
                        message: {
                            role: 'assistant',
                            tool_calls: [{
                                id: item.call_id,
                                type: 'function',
                                function: {
                                    name: item.name,
                                    arguments: item.arguments
                                }
                            }]
                        },
                        finish_reason: 'tool_calls'
                    });
                }
            });
        }

        if (responsesResponse.usage) {
            usage = {
                prompt_tokens: responsesResponse.usage.input_tokens || 0,
                completion_tokens: responsesResponse.usage.output_tokens || 0,
                total_tokens: responsesResponse.usage.total_tokens || 0,
                prompt_tokens_details: {
                    cached_tokens: responsesResponse.usage.input_tokens_details?.cached_tokens || 0
                },
                completion_tokens_details: {
                    reasoning_tokens: responsesResponse.usage.output_tokens_details?.reasoning_tokens || 0
                }
            };
        }

        return {
            id: responsesResponse.id || `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: responsesResponse.created_at || Math.floor(Date.now() / 1000),
            model: model || responsesResponse.model,
            choices: choices.length > 0 ? choices : [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: ''
                },
                finish_reason: 'stop'
            }],
            usage: usage
        };
    }

    toOpenAIStreamChunk(responsesChunk, model) {
        const resId = responsesChunk.response?.id || responsesChunk.id || `chatcmpl-${Date.now()}`;
        const created = responsesChunk.response?.created_at || responsesChunk.created || Math.floor(Date.now() / 1000);

        const delta = {};
        let finish_reason = null;

        if (responsesChunk.type === 'response.output_text.delta') {
            delta.content = responsesChunk.delta;
        } else if (responsesChunk.type === 'response.function_call_arguments.delta') {
            delta.tool_calls = [{
                index: responsesChunk.output_index || 0,
                function: {
                    arguments: responsesChunk.delta
                }
            }];
        } else if (responsesChunk.type === 'response.output_item.added' && responsesChunk.item?.type === 'function_call') {
            delta.tool_calls = [{
                index: responsesChunk.output_index || 0,
                id: responsesChunk.item.call_id,
                type: 'function',
                function: {
                    name: responsesChunk.item.name,
                    arguments: ''
                }
            }];
        } else if (responsesChunk.type === 'response.completed') {
            finish_reason = 'stop';
        }

        return {
            id: resId,
            object: 'chat.completion.chunk',
            created: created,
            model: model || responsesChunk.response?.model || responsesChunk.model,
            choices: [{
                index: 0,
                delta: delta,
                finish_reason: finish_reason
            }]
        };
    }
}
