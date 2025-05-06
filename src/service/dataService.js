const db = require("../config/db");
const axios = require("axios");
const cheerio = require("cheerio");
const { convertToKST } = require("../util/date");
const { contentRun } = require("./contentService");

const dataRun = async (data) => {
    let id = data["id"];
    let link = data["link"];
    let selector = data["selector"];

    //rssUrl링크 크롤링
    let rssData = await crawlXml(link);
    //DB저장
    await saveRssDatas(id, rssData);
    //rss링크 본문 처리 시작
    await contentRun(id, selector);
}

async function crawlXml(link){
    try{
        let response = await axios.get(link, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        let $ = cheerio.load(response.data, {
            xmlMode: true
        });

        // RSS 피드의 채널 정보 추출
        let channelInfo = {
            language: $('channel > language').text(),
            copyright: $('channel > copyright').text(),
            managingEditor: $('channel > managingEditor').text(),
            webMaster: $('channel > webMaster').text(),
            pubDate: $('channel > pubDate').text(),
            lastBuildDate: $('channel > lastBuildDate').text(),
            category: $('channel > category').text(),
            generator: $('channel > generator').text(),
            docs: $('channel > docs').text(),
            ttl: $('channel > ttl').text(),
            image: {
                url: $('channel > image > url').text(),
                title: $('channel > image > title').text(),
                link: $('channel > image > link').text()
            }
        };

        // 모든 item 요소 가져오기
        let items = [];
        $('item').each((index, element) => {
            let item = {
                title: $(element).find('title').text(),
                link: $(element).find('link').text(),
                description: $(element).find('description').text(),
                category: $(element).find('category').text(),
                pubDate: $(element).find('pubDate').text()
            };

            items.push(item);
        });

        return {
            channelInfo,
            items
        };
    }catch(e){
        console.error('크롤링 처리 에러 발생', e);
        throw e;
    }
}

async function saveRssDatas(rssUrlId, rssData) {
    try {
        let { channelInfo, items } = rssData;
        let insertCnt = 0, updateCnt = 0, dupCnt = 0;

        // 각 아이템에 대해 데이터베이스에 저장
        for (let item of items) {
            let chkRows = await db.query('SELECT * FROM rss_data WHERE link = $1 LIMIT 1', [item.link]);

            //기존에 데이터가 없을 경우
            if(!chkRows.rows || chkRows.rows.length === 0){
                let query =
                    `INSERT INTO rss_data (
                        rss_url_id, title, link, description, lang, copyright,
                        managing_editor, web_master, pub_date, last_build_date,
                        category, generator, docs, ttl, image, pub_date_kr
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6,
                        $7, $8, $9, $10,
                        $11, $12, $13, $14, $15, $16
                    )`;

                let params = [
                    rssUrlId,
                    item.title || '',
                    item.link || '',
                    item.description || '',
                    channelInfo.language || null,
                    channelInfo.copyright || null,
                    channelInfo.managingEditor || null,
                    channelInfo.webMaster || null,
                    item.pubDate || channelInfo.pubDate || null,
                    channelInfo.lastBuildDate || null,
                    item.category || channelInfo.category || null,
                    channelInfo.generator || null,
                    channelInfo.docs || null,
                    channelInfo.ttl || null,
                    channelInfo.image?.url || null,  // 이미지 URL만 저장
                    convertToKST(item.pubDate) || convertToKST(channelInfo.pubDate) || convertToKST(channelInfo.lastBuildDate) || null
                ];

                await db.query(query, params);
                insertCnt++;
            }
            //기존에 데이터가 있는데 title이 변경된 기사일 경우
            else if(chkRows.rows[0].title !== item.title){
                let query =
                    `UPDATE rss_data SET
                         title = $1,
                         description = $2,
                         lang = $3,
                         copyright = $4,
                         managing_editor = $5,
                         web_master = $6,
                         pub_date = $7,
                         last_build_date = $8,
                         category = $9,
                         generator = $10,
                         docs = $11,
                         ttl = $12,
                         image = $13,
                         vector_yn = 'N',
                         upt_dt = now(),
                         pub_date_kr = $14
                    WHERE link = $15`;

                let params = [
                    item.title || '',
                    item.description || '',
                    channelInfo.language || null,
                    channelInfo.copyright || null,
                    channelInfo.managingEditor || null,
                    channelInfo.webMaster || null,
                    item.pubDate || channelInfo.pubDate || null,
                    channelInfo.lastBuildDate || null,
                    item.category || channelInfo.category || null,
                    channelInfo.generator || null,
                    channelInfo.docs || null,
                    channelInfo.ttl || null,
                    channelInfo.image?.url || null,
                    convertToKST(item.pubDate) || convertToKST(channelInfo.pubDate) || convertToKST(channelInfo.lastBuildDate) || null,
                    item.link || ''  // link를 마지막으로 이동
                ];

                await db.query(query, params);
                updateCnt++;
            }else{
                dupCnt++;
            }
        }

        console.log(`RSS DATA 테이블 RSS_URL_ID ${rssUrlId} - INSERT ::: ${insertCnt}, UPDATE ::: ${updateCnt}, DUP ::: ${dupCnt}`);
        return true;
    } catch (error) {
        console.error('RSS DATA INSERT 과정 에러 발생', error);
        throw error;
    }
}

module.exports = {dataRun}