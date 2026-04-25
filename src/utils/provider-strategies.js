import { MODEL_PROTOCOL_PREFIX } from '../utils/common.js';
import { OpenAIStrategy } from '../providers/openai/openai-strategy.js';
import { ResponsesAPIStrategy } from '../providers/openai/openai-responses-strategy.js';

/**
 * Strategy factory that returns the appropriate strategy instance based on the provider protocol.
 */
class ProviderStrategyFactory {
    static getStrategy(providerProtocol) {
        switch (providerProtocol) {
            case MODEL_PROTOCOL_PREFIX.OPENAI:
                return new OpenAIStrategy();
            case MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES:
                return new ResponsesAPIStrategy();
            default:
                throw new Error(`Unsupported provider protocol: ${providerProtocol}`);
        }
    }
}

export { ProviderStrategyFactory };
