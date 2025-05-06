const db = require("../config/db");
const PQueue = require("p-queue").default;
const { dataRun } = require('../service/dataService');
const { vectorizeContent } = require("../service/openAiService");
const { storeVectorToMilvus } = require("../service/milvusService");

const urlRun = async () => {
    let rssUrls = await db.query('SELECT * FROM rss_url');
    let queue = new PQueue({ concurrency: 10 });

    let results = [];

    for (let rssUrl of rssUrls.rows) {
        queue.add(() => processRssUrl(rssUrl)
            .then(result => results.push({ status: 'success', ...result }))
            .catch(error => {
                console.error(`[${rssUrl.media_nm}] 처리 실패:`, error.message);
                results.push({ status: 'error', error: error.message, mediaName: rssUrl.media_nm });
            })
        );
    }

    await queue.onIdle();

    let successCount = results.filter(r => r.status === 'success').length;
    let failCount = results.filter(r => r.status === 'error').length;

    console.log(`성공: ${successCount}, 실패: ${failCount}`);
};

async function processRssUrl(rssUrl) {
    await dataRun(rssUrl);

    let list = await db.query(`
        SELECT
            rd.id,
            rd.title,
            rd.pub_date,
            rc."content"
        FROM 
            rss_data rd 
        JOIN rss_content rc on rd.id = rc.rss_data_id 
        WHERE
            rd.rss_url_id = $1
        AND
            rd.vector_yn != 'Y'
        AND
            date_trunc('day', COALESCE(rd.upt_dt, rd.reg_dt)) = CURRENT_DATE`,
        [rssUrl.id]
    );

    for (let data of list.rows) {
        let result = await vectorizeContent(data.title, data.content, data.pub_date);

        await db.query(`
        UPDATE
            rss_data
        SET
            vector_yn = 'Y'
        WHERE
            id = $1`, [data.id]);

        if (result.success) {
            await storeVectorToMilvus(data.id, result.vector);
        }
    }

    console.log(`[${rssUrl.media_nm}] 처리 완료`);
    return {
        mediaName: rssUrl.media_nm,
        url: rssUrl.url,
    };
}

module.exports = { urlRun };
