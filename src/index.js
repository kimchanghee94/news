//>>>>>>>>>>>>>>>>>TEST 용도
const express = require('express');
require('dotenv').config();

let app = express();
let PORT = process.env.PORT;
app.get('/', async (req, res) => {
    run();
});

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
});
//<<<<<<<<<<<<<<<<<


//>>>>>>>>>>>>>>>>>실제 돌릴 코드
const { run } = require("./scheduler/scheduler");
// run();
// <<<<<<<<<<<<<<<<<