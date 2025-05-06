const db = require("../config/db");
const axios = require("axios");
const cheerio = require("cheerio");

const contentRun = async (id, selector) => {
    let rssDatas = await db.query(`SELECT * FROM rss_data WHERE rss_url_id = ${id} AND date_trunc('day',reg_dt) = CURRENT_DATE ORDER BY ID`);

    for(let rssData of rssDatas.rows){
        let id = rssData["id"];
        let rssUrlId = rssData["rss_url_id"];
        let link = rssData["link"];

        //rssData 링크 크롤링
        let rssContent;

        //조선일보 크롤링 예외처리
        if(rssUrlId === 2){
            rssContent = await crawlChosunHttp(link, selector);
        }
        //한국경제 크롤링 예외처리
        else if(rssUrlId === 11){
            rssContent = await crawlHankyung(link, selector);
        }else{
            rssContent = await crawlHttp(link, selector);
        }

        //DB저장
        if(!!rssContent){
            await saveRssContents(id, rssContent);
        }
    }
}

async function crawlChosunHttp(link) {
    try {
        // 페이지 콘텐츠 가져오기
        let response = await axios.get(link, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // Fusion.globalContent 객체를 찾기 위한 정규식
        let globalContentRegex = /Fusion\.globalContent=(\{.*?\});Fusion\.globalContentConfig=/s;
        let matches = response.data.match(globalContentRegex);

        if (!matches || !matches[1]) {
            throw new Error('기사 콘텐츠를 찾을 수 없습니다.');
        }

        // JSON 파싱
        let globalContent = JSON.parse(matches[1]);

        // 콘텐츠 요소 추출 (기사 본문)
        if (globalContent.content_elements) {
            let content = '';

            globalContent.content_elements.forEach(element => {
                if (element.type === 'text' && element.content) {
                    content += element.content + ';';
                }
            });

            return content.trim();
        } else {
            throw new Error('기사 콘텐츠 요소를 찾을 수 없습니다.');
        }
    } catch (error) {
        console.error('조선일보 크롤링 에러:', error);
        return '';
    }
}

async function crawlHankyung(link, selector){
    try{
        let response = await axios.get(link, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Referer': 'https://www.hankyung.com/'
                }
            });

        let $ = cheerio.load(response.data);

        // 셀렉터를 사용하여 본문 콘텐츠 찾기
        let articleWrapper = $(selector);

        if (!articleWrapper.length) {
            throw new Error(`${link} 사이트 선택자 "${selector}"와 일치하는 요소를 찾을 수 없습니다.`);
        }

        let content = '';
        content = articleWrapper.text().trim();

        return content;
    }catch(e){
        console.error('크롤링 처리 에러 발생', e);
        return '';
    }
}

async function crawlHttp(link, selector){
    try{
        let response = await axios.get(link, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        let $ = cheerio.load(response.data);

        // 셀렉터를 사용하여 본문 콘텐츠 찾기
        let articleWrapper = $(selector);

        if (!articleWrapper.length) {
            throw new Error(`${link} 사이트 선택자 "${selector}"와 일치하는 요소를 찾을 수 없습니다.`);
        }

        let content = '';

        if(link.includes("yonhapnewstv") || link.includes("sbs") || link.includes("donga")
        || link.includes("edaily") || link.includes("mbn") || link.includes("todaykorea")
        || link.includes("ohmynews")){
            if("yonhapnewstv"){
                content = articleWrapper.clone().find(".videoWrap, .ynaobject.ynaimage").remove().end().text().trim();
            }else{
                content = articleWrapper.text().trim();
            }
        }else{
            articleWrapper.find('h1,h2,h3,h4,p,td,figcaption,span').each((i, elem) => {
                let text = $(elem).text().trim();
                content += (text + ';');
            });
        }

        return content;
    }catch(e){
        console.error('크롤링 처리 에러 발생', e);
        return '';
    }
}

async function saveRssContents(rssDataId, content){
    try{
        let chkRows = await db.query('SELECT * FROM rss_content WHERE rss_data_id = $1 LIMIT 1', [rssDataId]);

        if(!chkRows.rows || chkRows.rows.length === 0){
            let query =
                `INSERT INTO rss_content (
                    rss_data_id, content
                ) VALUES (
                    $1, $2
                )`;

            let params = [rssDataId, content];

            await db.query(query, params);
            console.log(`RSS CONTENT 테이블 RSS_DATA_ID INSERT ::: ${rssDataId}`);
        }else if(chkRows.rows[0].content !== content){
            let query =
                `UPDATE rss_content
                SET
                    content = $1,
                    upt_dt = now()
                WHERE
                    rss_data_id = $2
                `;

            let params = [content, rssDataId];
            await db.query(query, params);

            query =
                `UPDATE rss_data
                SET
                    vector_yn = 'N',
                    upt_dt = now()
                WHERE
                    id = $1`;

            params = [rssDataId];
            await db.query(query, params);
            console.log(`RSS CONTENT 테이블 RSS_DATA_ID UPDATE ::: ${rssDataId}`);
        }

        return true;
    }catch (error){
        console.error('RSS CONTENT INSERT 과정 에러 발생', error);
        throw error;
    }
}

module.exports = {contentRun}