const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { PuppeteerBlocker } = require('@cliqz/adblocker-puppeteer');
const fetch = require('cross-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
puppeteer.use(StealthPlugin());
app.use(express.json());
app.use(express.static('public'));

// Azure 持久化路徑：在 Web App for Containers 中，/home 是掛載的雲端硬碟
const rulesPath = '/home/rules.txt'; 
let sharedBrowser = null;
let sharedBlocker = null;

// 初始化檢查：若不存在則建立，確保 fs.readFileSync 不報錯
if (!fs.existsSync(rulesPath)) {
    try {
        fs.writeFileSync(rulesPath, '', 'utf-8');
        console.log("[系統] 已建立新的永久過濾規則檔");
    } catch (e) {
        console.error("[錯誤] 無法建立持久化檔案，改用臨時路徑");
        rulesPath = path.join(__dirname, 'rules.txt');
    }
}

async function getBlocker() {
    if (!sharedBlocker) {
        sharedBlocker = await PuppeteerBlocker.fromLists(fetch, [
            'https://easylist.to/easylist/easylist.txt'
        ]);
        const customRules = fs.readFileSync(rulesPath, 'utf-8').split('\n').filter(l => l.trim());
        if (customRules.length > 0) {
            sharedBlocker.update({ newRules: customRules });
            console.log(`[系統] 已加載 ${customRules.length} 條用戶自定義規則`);
        }
    }
    return sharedBlocker;
}

async function getBrowser() {
    if (sharedBrowser && sharedBrowser.connected) return sharedBrowser;
    
    console.log('[系統] 正在啟動受保護的瀏覽器進程...');
    sharedBrowser = await puppeteer.launch({
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process' // 減少進程開銷
        ]
    });
    return sharedBrowser;
}

// 導入過濾器並永久儲存 (滿足需求：存儲在 App 中)
app.post('/api/import-filter', async (req, res) => {
    const { filter } = req.body;
    if (!filter) return res.status(400).send("規則內容不能為空");
    try {
        fs.appendFileSync(rulesPath, `${filter}\n`, 'utf-8');
        const blocker = await getBlocker();
        blocker.update({ newRules: [filter] });
        res.json({ status: "success", info: "規則已永久存儲至 /home/rules.txt" });
    } catch (e) {
        res.status(500).send("寫入失敗: " + e.message);
    }
});

app.get('/api/videos', async (req, res) => {
    let page = null;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();
        const blocker = await getBlocker();
        await blocker.enableBlockingInPage(page);

        await page.goto('https://supjav.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const videos = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.post')).slice(0, 20).map(v => ({
                title: v.querySelector('h3')?.innerText || '無標題',
                link: v.querySelector('a')?.href,
                thumb: v.querySelector('img')?.getAttribute('data-src') || v.querySelector('img')?.src
            }));
        });
        res.json(videos);
    } catch (err) {
        console.error("抓取失敗:", err.message);
        res.status(500).json({ error: "解析服務忙碌中，請重新整理" });
    } finally {
        if (page) await page.close();
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 B2 伺服器啟動成功，埠號: ${PORT}`));