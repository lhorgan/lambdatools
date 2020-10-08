const cheerio = require('cheerio');
const axios = require('axios');

$event = {"url": "https://mobile.twitter.com/POTUS44/following"};

function getHTML(url) {
    let headers = {"User-Agent": "Mozilla/5.0 (iPad; CPU OS 13_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/85.0.4183.92 Mobile/15E148 Safari/604.1",
                   "X-Requested-With": "XMLHttpRequest"};
    
    // Make a request for a user with a given ID
    return axios.get(url, {headers: headers})
        .then(function (response) {
            return [false, response];
        })
        .catch(function (error) {
            return [true, error];
        });
}

async function go() {
    let response = {};
    let [error, data] = await getHTML($event.url);
    console.log(data);
    if(!error) {
        $ = cheerio.load(data);
        let usernameTags = $(".user-item");
        let usernames = [];
        for(let i = 0; i < usernames.length; i++) {
            usernames.push(usernameTags[i].text());
        }
        response["statusCode"] = 200;
        response["body"] = JSON.stringify({"usernames": usernames});
    }
    else {
        response["statusCode"] = 500;
        response["body"] = JSON.stringify({"error": error});
    }

    console.log(response);
    return response;
}

go();