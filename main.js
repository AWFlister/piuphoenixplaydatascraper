import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar, Cookie } from 'tough-cookie';
import fs from 'fs/promises';
import * as cheerio from 'cheerio'
import { format } from 'date-fns'
import xlsx from "json-as-xlsx"
import { home, host, myBest, gradeStr, cookieFilename as filename, directory, cookieTutorial } from './constants.js';
import { exit } from 'process';

async function readCookies() {
    let limit = 5, count = 1
    while(true){
        try {
            // Check if the file exists
            await fs.access(directory)
            await fs.access(filename);

            // File exists, read its content into a string
            const data = await fs.readFile(filename, 'utf8');
            console.log(`Contents of ${filename}:`);
            console.log(data);

            return data
        } catch (err) {
            if (err.code === 'ENOENT') {
                // Directory or file doesn't exist, create them
                if(err.path.includes('scoredata')) {
                    console.log(`Directory 'scoredata' doesn't exist. Creating...`);
                    await fs.mkdir(directory, { recursive: true });
                }
                if(err.path.includes('cookie')) {
                    console.log(`File ${filename} doesn't exist. Creating...`);
                    await fs.writeFile(filename, cookieTutorial);
                    console.log(`File ${filename} created. Please check https://github.com/AWFlister/piuphoenixplaydatascraper for next steps`);
                    throw err
                }
            } else {
                // Other error occurred, throw it
                console.error(`Error reading or writing ${filename}:`, err);
                throw err
            }

            if(count++ == limit) throw err
        }
    }
}

async function makeClient() {
    try {
        const cookieStr = await readCookies()

        const jar = new CookieJar();
        await Promise.all(cookieStr.split("; ").map(async cookie => {
            const [key, value] = cookie.split('=');

            await jar.setCookie(new Cookie({
                key,
                value,
                domain: host,
                path: '/',
            }), home);
        }));

        return wrapper(axios.create({ jar }))
    } catch (err) {
        if(err.code == 'ENOENT') {
            exit(0)
        }
        else {
            console.log("Error: ", err);
        }
    }
}

async function fetchData(client) {
    try {
        const allScores = []
        let last = false, page = 1, totalPage = 1
        while(!last && page < 6) {
            const myBestResponse = await client.get(myBest + '?page=' + page, { withCredentials: true });
            await fs.writeFile('my_best_scores.html', myBestResponse.data);
            const $ = cheerio.load(myBestResponse.data)

            const list = $('.my_best_scoreList').first().children()
            for (const item of list) {
                const modeRaw = $(item).find('.tw img').first().attr('src').split('/').pop()[0]
                const mode = modeRaw == 's' ? 'Single' : (modeRaw == 'd' ? 'Double' : 'Co-op')

                const levelFirstDigit = $(item).find('.numw div:nth-child(1) img').attr('src').split('/').pop().match(/\d/)?.[0]
                const levelSecondDigit = $(item).find('.numw div:nth-child(2) img').attr('src').split('/').pop().match(/\d/)?.[0]
                const level = levelFirstDigit + levelSecondDigit

                const entry = {
                    songName: $(item).find('.song_name p').text(),
                    mode,
                    level,
                    score: parseInt($(item).find('.etc_con > ul > li:nth-child(1) .num').text().replace(/\D/g, '')),
                    grade: gradeStr[$(item).find('.etc_con > ul > li:nth-child(2) img').attr('src')?.split('/').pop().replace(/\.[^.]+$/, '')],
                    plate: $(item).find('.etc_con > ul > li:nth-child(3) img').attr('src')?.split('/').pop().replace(/\.[^.]+$/, '').toUpperCase(),
                }

                console.log(entry)
                allScores.push(entry)
            }

            last = ($('.last').length == 0)
            if(!last) {
                totalPage = $('.last').first().parent().attr('onclick').split("=").pop().match(/\d+/)
            }
            console.log(`GET SCORES PAGE ${page}/${totalPage} OK`);
            page++
        }

        const title = `myBestScore_${format(new Date(), 'y-MM-dd_HH:mm')}.json`
        fs.appendFile(title, JSON.stringify(allScores))

        console.log('Play data has been successfully written to ' + title);

        // Export to excel file

        const schema = [
            {
                sheet: "Scores",
                columns: [
                    { label: "Song Name", value: "songName" },
                    { label: "Mode", value: "mode" },
                    { label: "Level", value: "level" },
                    { label: "Score", value: "score" },
                    { label: "Grade", value: "grade" },
                    { label: "Plate", value: "plate" },
                ],
                content: allScores
            },
        ]

        const settings = {
            fileName: title,
        }

        xlsx(schema, settings)

        console.log("Excel sheet successfully created");
    } catch (err) {
        console.error('Error:', err.message);
    }
}

const client = await makeClient()
if(client)
    fetchData(client);
