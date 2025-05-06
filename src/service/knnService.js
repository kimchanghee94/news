// Milvus 클라이언트와 KNN 모듈 가져오기
const db = require("../config/db");
const milvus = require("../config/milvus");
const knnModule = require("../util/knn"); // 첫 번째 파일

async function runClustering() {
    try {
        // Milvus 클라이언트 가져오기
        let client = await milvus.getClient();

        // 클러스터링 실행
        let result = await knnModule.clusterMilvusVectorsMultipleRuns(client, 30, 30);
        console.log("각 Cluster 데이터 분포율 ::: ", result.stats)

        await saveClusterData(result);
    } catch (error) {
        console.error("클러스터링 중 오류 발생:", error);
    }
}

async function saveClusterData(result){
    let groupIdRows = await db.query(`
            SELECT
                coalesce(max(group_id), 0) group_id
            FROM
                cluster`
    );

    let groupId = Number(groupIdRows.rows[0].group_id) + 1;

    // 각 클러스터의 뉴스 ID 목록 확인
    for (let [clusterId, ids] of Object.entries(result.idGroups)) {
        console.log(`${clusterId}: ${ids.length}개 뉴스 :: id List ${ids}`);
        let clusterIntId = parseInt(clusterId.split('_')[1], 10);

        let query = `
                INSERT INTO cluster
                    (group_id, cluster_id, rss_data_ids)
                VALUES
                    ($1, $2, $3)
            `;

        await db.query(query, [groupId, clusterIntId, ids]);
    }
}

module.exports = { runClustering };