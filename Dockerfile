# 使用 Playwright 官方映像，它已經預裝了所有 Chrome 依賴，保證不會有 Code 127
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# 設定工作目錄
WORKDIR /app

# 複製 package.json 並安裝依賴
COPY package.json ./
RUN npm install

# 複製其餘所有檔案
COPY . .

# 設定 Puppeteer 使用映像內建的 Chrome
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# 開放 Port 8080
EXPOSE 8080

# 啟動應用程式
CMD ["node", "app.js"]