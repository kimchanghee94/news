/**
 * 다양한 형식의 날짜 문자열을 PostgreSQL 타임스탬프 형식으로 변환하는 함수
 * @param {string} dateStr - 변환할 날짜 문자열
 * @returns {string} PostgreSQL 타임스탬프 형식으로 변환된 문자열
 */
function convertToKST(dateStr) {
    try {
        // 날짜 문자열에서 Date 객체 생성
        let date = new Date(dateStr);

        // 유효한 날짜인지 확인
        if (isNaN(date.getTime())) {
            return null; // 유효하지 않은 날짜는 null 반환
        }

        // KST 시간으로 변환 (UTC+9)
        let kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000 - date.getTimezoneOffset() * 60 * 1000));

        // 년, 월, 일 가져오기
        let year = kstDate.getUTCFullYear();
        let month = (kstDate.getUTCMonth() + 1).toString().padStart(2, '0');
        let day = kstDate.getUTCDate().toString().padStart(2, '0');

        // 시간, 분, 초 가져오기
        let hours = kstDate.getUTCHours().toString().padStart(2, '0');
        let minutes = kstDate.getUTCMinutes().toString().padStart(2, '0');
        let seconds = kstDate.getUTCSeconds().toString().padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}+09:00`;
    } catch (error) {
        console.error(`날짜 변환 오류: ${error.message}`);
        return null;
    }
}

module.exports = { convertToKST }