const { Pool } = require('pg');
require('dotenv').config();

// 데이터베이스 연결 정보 설정
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER, // .env 파일에서 사용자 이름 가져오기
    password: process.env.DB_PASSWORD, // .env 파일에서 비밀번호 가져오기
    max: 20, // 최대 클라이언트 수
    idleTimeoutMillis: 30000, // 유휴 타임아웃
    connectionTimeoutMillis: 2000, // 연결 타임아웃
});

// 연결 이벤트 리스너 추가
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    pool
};
