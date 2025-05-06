const milvus = require("../config/milvus");

// 벡터화한 데이터를 Milvus에 저장하는 함수
async function storeVectorToMilvus(id, vector) {
    try {
        // 벡터 유효성 검사
        if (!Array.isArray(vector) || vector.length !== 1536) {
            throw new Error(`Invalid vector format. Expected array of length 1536, got ${vector?.length}`);
        }

        let client = await milvus.getClient();

        // 기존 ID 존재 여부 확인
        let existing = await client.query({
            collection_name: milvus.collectionName,
            output_fields: ['id'],
            expr: `id == ${id}`,
            limit: 1,
            consistency_level: 'Strong'
        });

        if (existing.data.length > 0) {
            // 기존 데이터 soft delete 처리
            await client.deleteEntities({
                collection_name: milvus.collectionName,
                expr: `id == ${id}`
            });
            console.log(`Worker: 기존 ID ${id} soft delete 처리 완료`);
        }

        let insertResult = await client.insert({
            collection_name: milvus.collectionName,
            fields_data: [{
                id: id,
                vector: vector
            }]
        });

        console.log(`Worker: Primary Key ID ${id} 벡터 저장 완료`);
        return { success: true, insertResult: insertResult };
    } catch (error) {
        console.error("Worker: Milvus 저장 중 오류 발생:", error);
        return { success: false, error: error.message };
    }
}

module.exports = { storeVectorToMilvus }