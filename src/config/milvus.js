const { MilvusClient } = require("@zilliz/milvus2-sdk-node");
require('dotenv').config();

let milvusClient = null;
let collectionName = process.env.DB_VECTOR_COLLECTION_NAME;

// 초기화 함수
async function init() {
    if (milvusClient !== null) {
        return milvusClient;
    }

    try {
        milvusClient = new MilvusClient({
            address: process.env.DB_HOST + ":" + process.env.DB_VECTOR_PORT,
            timeout: 60000
        });

        // 연결 상태 확인
        await milvusClient.checkHealth();
        console.log('Connected to Milvus vector database');

        //docker-compose 맨처음 초기정보 지우고 시작할 경우
        //아래 메서드 처음만 실행시켜주고 주석처리해줄것
        await ensureCollection()

        return milvusClient;
    } catch (error) {
        console.error('Unexpected error connecting to Milvus database', error);
        milvusClient = null;
        throw error;
    }
}

// 클라이언트 얻기
async function getClient() {
    if (milvusClient === null) {
        return await init();
    }
    return milvusClient;
}

// 미리 초기화 시도
init().catch(err => {
    console.error('Failed to init Milvus client on startup', err);
});

module.exports = {
    collectionName,
    getClient,
    // 직접 특정 Milvus 함수에 대한 래퍼를 제공할 수도 있습니다
    search: async (collectionName, vectors, outputFields, options) => {
        let client = await getClient();
        return client.search(collectionName, vectors, outputFields, options);
    },
    query: async (collectionName, filter, outputFields, options) => {
        let client = await getClient();
        return client.query(collectionName, filter, outputFields, options);
    },
    // 필요에 따라 다른 함수들도 추가할 수 있습니다
};

//milvus 맨 첫음 초기화 시 돌려야 될 코드
async function ensureCollection() {
    try {
        // 컬렉션 존재 여부 확인
        let hasCollectionResponse = await milvusClient.hasCollection({
            collection_name: collectionName
        });

        let hasCollection = hasCollectionResponse.value === true;

        if (!hasCollection) {
            // 컬렉션 생성
            await milvusClient.createCollection({
                collection_name: collectionName,
                fields: [
                    {
                        name: "id",
                        description: "PRIMARY KEY",
                        data_type: 5, // INT64
                        is_primary_key: true,
                        autoID: false
                    },
                    {
                        name: "vector",
                        description: "Embedding Vector",
                        data_type: 101, // FloatVector
                        dim: 1536  // OpenAI의 text-embedding-3-small 모델 차원
                    }
                ]
            });

            // 인덱스 생성
            await milvusClient.createIndex({
                collection_name: collectionName,
                field_name: "vector",
                index_type: "IVF_FLAT",
                metric_type: "L2",
                params: { nlist: 1024 }
            });

            console.log("Worker: 컬렉션 생성 완료");
        }

        // 컬렉션 로드
        try {
            await milvusClient.loadCollection({
                collection_name: collectionName
            });
        } catch (error) {
            if (error.message && error.message.includes("already loaded")) {
                console.log("Worker: 컬렉션이 이미 로드되어 있습니다");
            } else {
                throw error;
            }
        }

        return true;
    } catch (error) {
        console.error("Worker: 컬렉션 초기화 오류:", error);
        throw error;
    }
}