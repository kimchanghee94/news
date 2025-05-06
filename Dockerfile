# 1. Node.js 공식 이미지 사용
FROM node:18

# 2. 작업 디렉토리 설정
WORKDIR /app

# 3. package.json & package-lock.json 복사 후 설치
COPY package.json nodemon.json ./
RUN npm install

# 4. 소스 코드 복사
COPY . .

# 5. 컨테이너 시작 시 nodemon 실행
CMD ["npx", "nodemon", "src/index.js"]