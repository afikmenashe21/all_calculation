const Web3 = require('web3');
const path = require("path");
const fs = require('fs');
const https = require('https');
const axios = require('axios');
require("json-circular-stringify");
const superagent = require('superagent');
var Agent = require('agentkeepalive');

const tokenABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "tokenABI.json")));

// const address = "0x469823c7B84264D1BAfBcD6010e9cdf1cac305a3"; // bulls // works 20 sec
// const address = "0xeb6DffB87315a2BdF4dedf72B993AdC960773A0D"; // mec // works 50 sec
// const address = "0xdbcab7a768ea9a00b2ffa5a2eb387cad609e2114"; // Alpha kongs // does not work uri :https://storage.googleapis.com/alphakongclub/metadata/1 download ipfs file
// const address = "0x0d3669C118330B1990bFb416691982f342e5e9F0" // Wabi sabi // works
// const address = "0xe1BD5802406D41160Aae5a2CD4943E5BA230bfff" // Super Fat // too many requests
// const address ="0x2b841d4b7ca08D45Cc3DE814de08850dC3008c43" // Skulltool // works https://skulltoons.s3.amazonaws.com/7697.json
// const address = "0xf61F24c2d93bF2dE187546B14425BF631F28d6dC" // wow // to check whats going over there
// const address = "0x2Dec96736E7d24e382e25D386457F490Ae64889e" // peaceful // works wrong calculation
// const address = "0x762Bc5880F128DCAc29cffdDe1Cf7DdF4cFC39Ee" // ??? // 9975 / 10K stops, need retry mechanism
const address = "0xfa7e3f898c80e31a3aedeae8b0c713a3f9666264" // akuma

// https://mainnet.infura.io/v3/ff83866dfc8a4786a3db399f1bf8af10 // Mine DEV
// https://mainnet.infura.io/v3/08e6d0e702084c7d9c7664a108369928 // Mine regular
// https://mainnet.infura.io/v3/ca05ad2cb2e449d19c2adb6bb0385702 // Nikita
const web3 = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io/v3/08e6d0e702084c7d9c7664a108369928'));

const tokenContract = new web3.eth.Contract(tokenABI, address);

var keepaliveAgent = new https.Agent({
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 60000,
  keepAliveTimeout: 30000 // free socket keepalive for 30 seconds
});

var totalSupply;
var threadNum;
var remainderNum;
const map = new Map();
const attributesMap = new Map();
var rarityMap = new Map();
var imageMap = new Map();
const failedTokens = new Set()
var moreThanOneAtt = 0;
var lessThanOneAtt = 0;
var legenderies = 0;
var startTime;
var endTime;
var osList;

async function readOsData() {
  return new Promise((resolve, reject) => {
    fs.readFile("./resources/os-for-sale.txt", 'utf8', function (err, data) {
      if (err) throw err;
      let list = data
      list = list.substring(1);
      list = list.slice(0, -1);
      list = list.replaceAll('\"', '');
      list = list.split(",")
      list = list.map(i => Number(i))
      console.log("Got the OS list");
      resolve(list);
    });
  });
}

async function start(startId, step) {
  for (let id = startId + 1; id < startId + step + 1; id++) {

    // id = id -1; // if token start on 0
    let metadataURL = await tokenContract.methods.tokenURI(id  ).call();
    if (!metadataURL.includes("http") && !metadataURL.includes("ipfs")) {
      metadataURL = "https://ipfs.io/ipfs/".concat(metadataURL);
    }
    else if (metadataURL.includes("ipfs://")) {
      metadataURL = metadataURL.replace("ipfs://", "https://ipfs.io/ipfs/")
    }

    console.log(metadataURL)

    // http form
    // const request = https.get(metadataURL, function (response) {
    //   stream.on('finish', function () {
    //     parseData(id);
    //   });
    // });

    // super agent form 
    superagent
      .get(metadataURL)
      .agent(keepaliveAgent)
      .end((err, response) => {
        if (err) {
          console.log("Error with response" + id)
          console.log(err)
          failedTokens.add(id);
        } else {
          // console.log(JSON.stringify(response.text))
          let obj
          try {
            obj = JSON.parse(response.text);
            let attr = obj.attributes;
            imageMap.set(id, obj.image);
            map.set(id, attr);
            console.log("Map size : " + map.size)
            parseData()
          } catch (error) {
            console.log("Erroroororor" + id + JSON.parse(response.text))
            failedTokens.add(id);
          }
        }
      })

      failedTokens.forEach(function(value) {
        id = value
        superagent
        .get(metadataURL)
        .agent(keepaliveAgent)
        .end((err, response) => {
          if (err) {
            console.log("Error with response" + id)
            console.log(err)
            failedTokens.add(id);
          } else {
            // console.log(JSON.stringify(response.text))
            let obj
            try {
              obj = JSON.parse(response.text);
              let attr = obj.attributes;
              imageMap.set(id, obj.image);
              map.set(id, attr);
              console.log("Map size : " + map.size)
              parseData()
            } catch (error) {
              console.log("Erroroororor" + id + JSON.parse(response.text))
              failedTokens.add(id);
            }
          }
        })
      })

  }
}

function replacer(key, value) {
  if (value instanceof Map) {
    return {
      dataType: 'Map',
      value: Array.from(value.entries()), // or with spread: value: [...value]
    };
  } else {
    return value;
  }
}

function parseData() {

  var legenderyArr = [];
  attributesMap.set("Legendary", legenderyArr);

  // Count attributes 
  if (map.size == totalSupply) {
    map.forEach((values, keys) => {
      if (values.length > 1) {
        values.forEach(att => {
          if (!attributesMap.get(att.trait_type)) {
            let counterMap = new Map();
            counterMap.set(att.value, 1);
            attributesMap.set(att.trait_type, counterMap);
          } else {
            if (attributesMap.get(att.trait_type).get(att.value)) {
              // increase
              attributesMap.get(att.trait_type).set(att.value, attributesMap.get(att.trait_type).get(att.value) + 1);
            } else {
              // insert new trait counter
              attributesMap.get(att.trait_type).set(att.value, 1);
            }
          }
        })
        moreThanOneAtt++;
      } else if (values.length == 1) {
        console.log("Legendary : " + keys + " Type: " + values[0].value)
        attributesMap.get("Legendary").push(keys);
        legenderies++
      } else {
        lessThanOneAtt++;
      }
    })
    console.log("Legendaries : " + legenderies);
    console.log("More than one attributes: " + moreThanOneAtt);
    console.log("Less than one attributes(Un-revealed) " + lessThanOneAtt);

    // create map between id to rarity
    let tempStart = performance.now();
    map.forEach((traits, nftId) => {
      let rarity = 0;
      let rarityPercentage;
      let countOfTraitExistInMap;
      let trait_val;
      let sum;
      if (traits.length != 1) {

        for (let [key, value] of attributesMap) {
          if (traits.map(trait => trait.trait_type).includes(key)) {
            // get the attribute count
            trait_val = traits.find(trait => trait.trait_type === key).value
            countOfTraitExistInMap = value.get(trait_val)
            rarityPercentage = countOfTraitExistInMap / totalSupply
            rarity += (1 / rarityPercentage);
          } else if (key !== 'Legendary') {
            sum = countOfTrait(value);
            rarityPercentage = (totalSupply - sum) / totalSupply
            rarity += (1 / rarityPercentage);
          }
        }

        rarityMap.set(nftId /*+ " -> " + imageMap.get(nftId)*/, rarity);
      } else {
        rarityMap.set(nftId /*+ " -> " + imageMap.get(nftId)*/, 999999);
      }
    })

    let tempEndTime = performance.now();
    console.log("calctime: " + (tempEndTime - tempStart) / 1000)

    // sort
    rarityMap = new Map([...rarityMap.entries()].sort((a, b) => b[1] - a[1]));

    // cut the top 10%
    let arrayTmp = Array.from(rarityMap).slice(0, rarityMap.size * 0.1)
    rarityMap = new Map(arrayTmp)

    // convert map to array of objects {id, rank, score}
    let i = 0;
    let rarityArray = Array.from(rarityMap, function (item) {
      i++;
      return { id: item[0], rank: i, score: item[1] }
    });

    let availableNfts = [];

    for (var obj in rarityArray) {
      if (osList.includes(obj.id)) {
        availableNfts.push(obj);
      }
    }

    fs.writeFile('NFT-stats.json', JSON.stringify(attributesMap, replacer), function (err) {
      if (err) return console.log(err);
    });

    // fs.writeFile('NFT-rarity-results.json', JSON.stringify(rarityMap, replacer), function (err) {
    //   if (err) return console.log(err);
    // });

    fs.writeFile('NFT-rarity-results.json', JSON.stringify(rarityArray, replacer), function (err) {
      if (err) return console.log(err);
    });

    fs.writeFile('NFT-available-results.json', JSON.stringify(availableNfts, replacer), function (err) {
      if (err) return console.log(err);
    });

    endTime = performance.now()
    console.log(`Method took ${(endTime - startTime) / 1000} seconds`)
    console.log("Done")
  }

}

function countOfTrait(traitMap) {
  let sum = 0;
  traitMap.forEach(value => {
    sum += value;
  });
  return sum;
}

async function main() {
  startTime = performance.now();
  totalSupply = await tokenContract.methods.totalSupply().call();
  // totalSupply = 4000
  let divder = 100;
  threadNum = Math.floor(totalSupply / divder);
  remainderNum = Math.floor(totalSupply % divder);

  console.log("Fetching :" + totalSupply)
  for (let i = 0; i < threadNum; i++) {
    start(i * divder, divder);
  }

  start(threadNum * divder, remainderNum)

}

(async function readOsDataNow() {
  osList = await readOsData();
  console.log("Open sea items in variable")
})()

main();


/**Error: Too Many Requests
    at Request.callback (C:\Reveal bots\all collection calculation\node_modules\superagent\lib\node\index.js:921:17)
    at IncomingMessage.<anonymous> (C:\Reveal bots\all collection calculation\node_modules\superagent\lib\node\index.js:1165:20)
    at IncomingMessage.emit (node:events:402:35)
    at endReadableNT (node:internal/streams/readable:1343:12)
    at processTicksAndRejections (node:internal/process/task_queues:83:21) {
  status: 429,
  response: <ref *1> Response {
    _events: [Object: null prototype] {},
    _eventsCount: 0,
    _maxListeners: undefined,
    res: IncomingMessage {
      _readableState: [ReadableState],
      _events: [Object: null prototype],
      _eventsCount: 4,
      _maxListeners: undefined,
      socket: null,
      httpVersionMajor: 1,
      httpVersionMinor: 1,
      httpVersion: '1.1',
      complete: true,
      rawHeaders: [Array],
      rawTrailers: [],
      aborted: false,
      upgrade: false,
      url: '',
      method: null,
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      client: [TLSSocket],
      _consuming: false,
      _dumped: false,
      req: [ClientRequest],
      text: '<html>\r\n' +
        '<head><title>429 Too Many Requests</title></head>\r\n' +
        '<body>\r\n' +
        '<center><h1>429 Too Many Requests</h1></center>\r\n' +
        '<hr><center>openresty</center>\r\n' +
        '</body>\r\n' +
        '</html>\r\n',
      [Symbol(kCapture)]: false,
      [Symbol(kHeaders)]: [Object],
      [Symbol(kHeadersCount)]: 22,
      [Symbol(kTrailers)]: null,
      [Symbol(kTrailersCount)]: 0,
      [Symbol(RequestTimeout)]: undefined
    },
    request: Request {
      _events: [Object: null prototype] {},
      _eventsCount: 0,
      _maxListeners: undefined,
      _enableHttp2: false,
      _agent: [Agent],
      _formData: null,
      method: 'GET',
      url: 'https://ipfs.io/ipfs/QmU7cdYqPSgfvTLziogHCShri27kDJYf4LCubeSQbHJoVQ/1',
      _header: {},
      header: {},
      writable: true,
      _redirects: 0,
      _maxRedirects: 5,
      cookies: '',
      qs: {},
      _query: [],
      qsRaw: [],
      _redirectList: [],
      _streamRequest: false,
      _lookup: undefined,
      req: [ClientRequest],
      protocol: 'https:',
      host: 'ipfs.io',
      _endCalled: true,
      _callback: [Function (anonymous)],
      res: [IncomingMessage],
      _resBuffered: true,
      response: [Circular *1],
      called: true,
      [Symbol(kCapture)]: false
    },
    req: ClientRequest {
      _events: [Object: null prototype],
      _eventsCount: 3,
      _maxListeners: undefined,
      outputData: [],
      outputSize: 0,
      writable: true,
      destroyed: true,
      _last: true,
      chunkedEncoding: false,
      shouldKeepAlive: true,
      maxRequestsOnConnectionReached: false,
      _defaultKeepAlive: true,
      useChunkedEncodingByDefault: false,
      sendDate: false,
      _removedConnection: false,
      _removedContLen: false,
      _removedTE: false,
      _contentLength: 0,
      _hasBody: true,
      _trailer: '',
      finished: true,
      _headerSent: true,
      _closed: false,
      socket: [TLSSocket],
      _header: 'GET /ipfs/QmU7cdYqPSgfvTLziogHCShri27kDJYf4LCubeSQbHJoVQ/1 HTTP/1.1\r\n' +
        'Host: ipfs.io\r\n' +
        'Accept-Encoding: gzip, deflate\r\n' +
        'Connection: keep-alive\r\n' +
        '\r\n',
      _keepAliveTimeout: 0,
      _onPendingData: [Function: nop],
      agent: [Agent],
      socketPath: undefined,
      method: 'GET',
      maxHeaderSize: undefined,
      insecureHTTPParser: undefined,
      path: '/ipfs/QmU7cdYqPSgfvTLziogHCShri27kDJYf4LCubeSQbHJoVQ/1',
      _ended: true,
      res: [IncomingMessage],
      aborted: false,
      timeoutCb: null,
      upgradeOrConnect: false,
      parser: null,
      maxHeadersCount: null,
      reusedSocket: false,
      host: 'ipfs.io',
      protocol: 'https:',
      [Symbol(kCapture)]: false,
      [Symbol(kNeedDrain)]: false,
      [Symbol(corked)]: 0,
      [Symbol(kOutHeaders)]: [Object: null prototype],
      [Symbol(requestOptions)]: [Object: null prototype],
      [Symbol(requestAsyncResource)]: null
    },
    text: '<html>\r\n' +
      '<head><title>429 Too Many Requests</title></head>\r\n' +
      '<body>\r\n' +
      '<center><h1>429 Too Many Requests</h1></center>\r\n' +
      '<hr><center>openresty</center>\r\n' +
      '</body>\r\n' +
      '</html>\r\n',
    files: undefined,
    buffered: true,
    headers: {
      server: 'openresty',
      date: 'Tue, 05 Apr 2022 14:56:47 GMT',
      'content-type': 'text/html',
      'content-length': '166',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'X-Requested-With, Range, Content-Range, X-Chunked-Output, X-Stream-Output',
      'access-control-expose-headers': 'Content-Range, X-Chunked-Output, X-Stream-Output',
      'x-ipfs-lb-pop': 'gateway-bank2-fr2',
      'strict-transport-security': 'max-age=31536000; includeSubDomains; preload'
    },
    header: {
      server: 'openresty',
      date: 'Tue, 05 Apr 2022 14:56:47 GMT',
      'content-type': 'text/html',
      'content-length': '166',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'X-Requested-With, Range, Content-Range, X-Chunked-Output, X-Stream-Output',
      'access-control-expose-headers': 'Content-Range, X-Chunked-Output, X-Stream-Output',
      'x-ipfs-lb-pop': 'gateway-bank2-fr2',
      'strict-transport-security': 'max-age=31536000; includeSubDomains; preload'
    },
    statusCode: 429,
    status: 429,
    statusType: 4,
    info: false,
    ok: false,
    redirect: false,
    clientError: true,
    serverError: false, */