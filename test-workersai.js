#!/usr/bin/env node
/**
 * Workers AI 适配器测试脚本
 * 测试 Cloudflare Workers AI 与 A-Plan 的集成
 */

import { WorkersAIApiService } from './src/providers/workersai/workersai-core.js';

const config = {
    accountId: 'YOUR_ACCOUNT_ID',
    gatewayId: 'a-plan-gateway',
    cfApiToken: 'YOUR_API_KEY_HERE',
    REQUEST_MAX_RETRIES: 2,
    REQUEST_BASE_DELAY: 500
};

console.log('🧪 Workers AI 适配器测试\n');

// 测试 1：服务初始化
console.log('测试 1: 服务初始化...');
try {
    const service = new WorkersAIApiService(config);
    console.log('✅ 服务初始化成功\n');
} catch (error) {
    console.error(`❌ 服务初始化失败：${error.message}\n`);
    process.exit(1);
}

// 测试 2：模型列表
console.log('测试 2: 获取模型列表...');
const service = new WorkersAIApiService(config);
service.listModels()
    .then(modelList => {
        console.log(`✅ 获取到 ${modelList.data?.length || 0} 个模型:`);
        modelList.data?.forEach(model => {
            console.log(`   - ${model.id} (${model.owned_by})`);
        });
        console.log();
        
        // 测试 3：聊天调用
        console.log('测试 3: 聊天调用...');
        const testBody = {
            messages: [
                { role: 'user', content: '你好，请用中文简短回答：1+1 等于几？' }
            ],
            max_tokens: 50
        };
        
        return service.generateContent('@cf/meta/llama-3.1-8b-instruct', testBody);
    })
    .then(response => {
        console.log('✅ 聊天调用成功:');
        console.log(`   响应 ID: ${response.id}`);
        console.log(`   模型：${response.model}`);
        console.log(`   内容：${response.choices?.[0]?.message?.content}`);
        console.log(`   Token 使用：${JSON.stringify(response.usage)}`);
        console.log('\n🎉 所有测试通过！');
        
        // 测试 4：响应格式验证
        console.log('\n测试 4: 响应格式验证...');
        const isValidOpenAIFormat = 
            response.id &&
            response.object === 'chat.completion' &&
            response.created &&
            response.model &&
            Array.isArray(response.choices) &&
            response.choices[0]?.message?.content;
        
        if (isValidOpenAIFormat) {
            console.log('✅ 响应格式符合 OpenAI 标准');
        } else {
            console.log('❌ 响应格式不符合 OpenAI 标准');
        }
        
        console.log('\n=== 测试完成 ===');
        process.exit(0);
    })
    .catch(error => {
        console.error(`❌ 测试失败：${error.message}`);
        if (error.response?.data) {
            console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    });