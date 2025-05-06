const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// 콘텐츠를 벡터화하는 함수
async function vectorizeContent(title, content, date) {
    try {
        let textToEmbed = `제목: ${title}\n내용: ${content}\n작성일자: ${date}`;

        let embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small", // 또는 다른 적절한 임베딩 모델
            input: textToEmbed
        });

        let vector = embeddingResponse.data[0].embedding;

        return {
            success: true,
            vectorDimension: vector.length,
            vector: vector,
            sampleValues: vector.slice(0, 10)
        };

    } catch (error) {
        console.error("벡터화 중 오류 발생:", error);
        return { success: false, error: error.message };
    }
}

module.exports = { vectorizeContent }