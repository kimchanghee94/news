const cron = require("node-cron");
const { urlRun } = require("../service/urlService");
const { runClustering } = require("../service/knnService");


const run = async ()=>{
    console.log("======================RSS URL CRAWLER START======================");
    await urlRun();
    // await runClustering();
    console.log("======================RSS URL CRAWLER END======================");
};

/*
const run = ()=>{
    cron.schedule("0/20 * * * *", async() => {
        let now = new Date();
        console.log(`======================= RSS URL CRAWLER START (${now.toISOString()}) =======================`);
        await urlRun();
        console.log(`======================= RSS URL CRAWLER END (${now.toISOString()}) =======================`);

        //3시간 단위에서는 rulRun 작업이후에 처리되도록 한다.
        if (now.getHours() % 3 === 0 && now.getMinutes() === 0) {
            console.log(`======================= CLUSTERING START (${now.toISOString()}) =======================`);
            await runClustering();
            console.log(`======================= CLUSTERING END (${now.toISOString()}) =======================`);
        }
    });
};
*/
module.exports = { run };