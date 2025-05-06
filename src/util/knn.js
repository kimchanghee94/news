require('dotenv').config();
const db = require("../config/db");

/**
 * Milvus 벡터 데이터를 KNN 알고리즘으로 클러스터링하고 ID 그룹을 조회하는 모듈
 */

// KNN 클러스터링 및 분석에 필요한 라이브러리
const _ = require('lodash');
let collectionName = process.env.DB_VECTOR_COLLECTION_NAME;


/**
 * Milvus에서 모든 벡터 데이터를 조회하는 함수
 * @param {Object} client - Milvus 클라이언트 인스턴스
 * @returns {Promise<Array>} 모든 벡터 데이터와 ID
 */
async function getAllVectors(client) {
    let batchSize = 100;
    let allData = [];

    // 지난 24시간 내의 데이터 ID 가져오기
    let ids = await db.query(`
        SELECT 
            rd.id, 
            rd.pub_date_kr
        FROM 
            rss_data rd
        WHERE 
            rd.pub_date_kr IS NOT NULL
        AND 
            rd.pub_date_kr::timestamp >= NOW() - INTERVAL '24 hours'
        ORDER BY
            rd.id`);

    if(!ids.rows || ids.rows.length === 0){
        return allData;
    }

    // 모든 ID 목록
    let idList = ids.rows.map(row => row.id);

    // 처리할 ID 배열을 청크로 나누기
    for (let i = 0; i < idList.length; i += batchSize) {
        // 현재 청크의 ID 목록
        let currentBatchIds = idList.slice(i, i + batchSize);

        if (currentBatchIds.length === 0) break;

        let queryResp = await client.query({
            collection_name: collectionName,
            output_fields: ['id', 'vector'],
            expr: `id in [${currentBatchIds.join(',')}]`,
            limit: batchSize,
            consistency_level: 'Strong'
        });

        let results = queryResp?.data || [];

        if (results.length > 0) {
            allData.push(...results);
        }
    }

    return allData;
}

/**
 * 유클리드 거리 계산 함수
 * @param {Array} vector1 - 첫 번째 벡터
 * @param {Array} vector2 - 두 번째 벡터
 * @returns {number} 두 벡터 간의 유클리드 거리
 */
function euclideanDistance(vector1, vector2) {
    if (vector1.length !== vector2.length) {
        throw new Error('벡터 차원이 일치하지 않습니다.');
    }

    let sum = 0;
    for (let i = 0; i < vector1.length; i++) {
        sum += Math.pow(vector1[i] - vector2[i], 2);
    }

    return Math.sqrt(sum);
}

/**
 * KNN 알고리즘을 사용하여 벡터 데이터를 클러스터링하는 함수
 * @param {Array} vectors - 벡터 데이터 배열 ({id, vector} 형태)
 * @param {number} k - 클러스터 수
 * @param {number} maxIterations - 최대 반복 횟수
 * @returns {Object} 클러스터링 결과 (클러스터 ID별 벡터 ID 그룹)
 */
async function knnClustering(vectors, k, maxIterations = 100) {
    if (vectors.length < k) {
        throw new Error('데이터 수가 클러스터 수보다 적습니다.');
    }

    // 초기 중심점 무작위 선택
    let centroids = [];
    let usedIndices = new Set();

    for (let i = 0; i < k; i++) {
        let randomIndex;
        do {
            randomIndex = Math.floor(Math.random() * vectors.length);
        } while (usedIndices.has(randomIndex));

        usedIndices.add(randomIndex);
        centroids.push([...vectors[randomIndex].vector]); // 복사본 사용
    }

    let clusters = {};
    let iterations = 0;
    let isConverged = false;

    // 클러스터링 반복
    while (!isConverged && iterations < maxIterations) {
        // 각 벡터를 가장 가까운 중심점에 할당
        clusters = Array(k).fill().map(() => []);

        for (let item of vectors) {
            let distances = centroids.map(centroid =>
                euclideanDistance(item.vector, centroid)
            );

            let closestCentroidIndex = distances.indexOf(Math.min(...distances));
            clusters[closestCentroidIndex].push(item);
        }

        // 중심점 업데이트
        let centroidsChanged = false;

        for (let i = 0; i < k; i++) {
            if (clusters[i].length === 0) continue; // 빈 클러스터는 건너뜀

            let newCentroid = Array(vectors[0].vector.length).fill(0);

            for (let item of clusters[i]) {
                for (let j = 0; j < item.vector.length; j++) {
                    newCentroid[j] += item.vector[j];
                }
            }

            for (let j = 0; j < newCentroid.length; j++) {
                newCentroid[j] /= clusters[i].length;
            }

            // 중심점 변화 확인
            if (!centroidsChanged) {
                let distance = euclideanDistance(centroids[i], newCentroid);
                if (distance > 0.001) { // 임계값 설정
                    centroidsChanged = true;
                }
            }

            centroids[i] = newCentroid;
        }

        // 수렴 여부 확인
        if (!centroidsChanged) {
            isConverged = true;
        }

        iterations++;
    }

    // ID 그룹으로 변환
    let idGroups = {};

    for (let i = 0; i < k; i++) {
        idGroups[`cluster_${i}`] = clusters[i].map(item => item.id);
    }

    return {
        idGroups,
        centroids,
        iterations,
        converged: isConverged
    };
}

/**
 * 클러스터링 품질 평가 함수 (클러스터 내 분산 - 낮을수록 좋음)
 * @param {Array} vectors - 벡터 데이터 배열
 * @param {Array} centroids - 클러스터 중심점 배열
 * @returns {number} 품질 점수 (작을수록 좋음)
 */
function evaluateClusteringQuality(vectors, centroids) {
    let totalVariance = 0;

    // 각 벡터를 가장 가까운 중심점에 할당
    for (let item of vectors) {
        let distances = centroids.map(centroid =>
            euclideanDistance(item.vector, centroid)
        );

        // 가장 가까운 중심점과의 거리
        let minDistance = Math.min(...distances);

        // 중심점으로부터의 거리의 제곱을 분산으로 사용
        totalVariance += minDistance * minDistance;
    }

    // 벡터 수로 나누어 평균 분산 계산
    return totalVariance / vectors.length;
}

/**
 * 여러 번 클러스터링을 실행하여 최적의 결과를 선택하는 함수
 * @param {Array} vectors - 벡터 데이터 배열
 * @param {number} k - 클러스터 수
 * @param {number} runs - 실행 횟수
 * @param {number} maxIterations - 각 실행의 최대 반복 횟수
 * @returns {Promise<Object>} 최적의 클러스터링 결과
 */
async function runMultipleClustering(vectors, k, runs, maxIterations = 100) {
    let results = [];

    // 여러 번 클러스터링 실행
    for (let run = 1; run <= runs; run++) {
        let result = await knnClustering(vectors, k, maxIterations);

        // 클러스터링 품질 평가 (클러스터 내 분산)
        let score = evaluateClusteringQuality(vectors, result.centroids);

        results.push({
            ...result,
            score
        });

        // console.log(`클러스터링 실행 ${run} 완료. 점수: ${score.toFixed(4)}`);
    }

    // 점수에 따라 정렬 (낮은 점수가 더 좋음 - 클러스터 내 분산이 작은 것)
    results.sort((a, b) => a.score - b.score);

    let bestResult = results[0];
    console.log(`최적의 클러스터링 결과 선택 (점수: ${bestResult.score.toFixed(4)})`);

    return bestResult;
}

/**
 * Milvus에서 벡터 데이터를 조회하고 여러 번 KNN으로 클러스터링하는 함수
 * @param {Object} client - Milvus 클라이언트 인스턴스
 * @param {number} k - 클러스터 수
 * @param {number} runs - 클러스터링 실행 횟수
 * @returns {Promise<Object>} 최적의 클러스터링 결과
 */
async function clusterMilvusVectorsMultipleRuns(client, k, runs) {
    try {
        let vectors = await getAllVectors(client);

        console.log(`총 ${vectors.length}개의 벡터를 조회했습니다. ${runs}번의 KNN 클러스터링 시작...`);

        // 여러 번 클러스터링 실행
        let clusteringResult = await runMultipleClustering(vectors, k, runs);

        // console.log(`최적의 클러스터링 결과: ${clusteringResult.iterations}번 반복, ${Object.keys(clusteringResult.idGroups).length}개 클러스터 생성.`);

        // 클러스터별 통계
        let stats = {};
        for (let [clusterId, ids] of Object.entries(clusteringResult.idGroups)) {
            stats[clusterId] = {
                count: ids.length,
                percentage: (ids.length / vectors.length * 100).toFixed(2) + '%'
            };
        }

        return {
            ...clusteringResult,
            stats,
            totalVectors: vectors.length
        };
    } catch (error) {
        console.error('벡터 클러스터링 중 오류 발생:', error);
        throw error;
    }
}

/**
 * Milvus에서 벡터 데이터를 조회하고 KNN으로 클러스터링하는 메인 함수
 * @param {Object} client - Milvus 클라이언트 인스턴스
 * @param {number} k - 클러스터 수
 * @returns {Promise<Object>} 클러스터링 결과
 */
async function clusterMilvusVectors(client, k) {
    try {
        let vectors = await getAllVectors(client);

        console.log(`총 ${vectors.length}개의 벡터를 조회했습니다. KNN 클러스터링 시작...`);
        let clusteringResult = await knnClustering(vectors, k);

        console.log(`클러스터링 완료. ${clusteringResult.iterations}번 반복, ${Object.keys(clusteringResult.idGroups).length}개 클러스터 생성.`);

        // 클러스터별 통계
        let stats = {};
        for (let [clusterId, ids] of Object.entries(clusteringResult.idGroups)) {
            stats[clusterId] = {
                count: ids.length,
                percentage: (ids.length / vectors.length * 100).toFixed(2) + '%'
            };
        }

        return {
            ...clusteringResult,
            stats,
            totalVectors: vectors.length
        };
    } catch (error) {
        console.error('벡터 클러스터링 중 오류 발생:', error);
        throw error;
    }
}

module.exports = {
    clusterMilvusVectors,
    clusterMilvusVectorsMultipleRuns
};