const Web3 = require('web3');
const path = require("path");
const fs = require('fs');
const https = require('https');
const axios = require('axios');
require("json-circular-stringify");
const superagent = require('superagent');
var Agent = require('agentkeepalive');
const console = require('console');
var backoff = require('backoff');
const express = require('express')
const app = express()


const tokenABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "tokenABI.json")));

// const address = "0x469823c7B84264D1BAfBcD6010e9cdf1cac305a3"; // bulls // works 18 sec
// const address = "0xeb6DffB87315a2BdF4dedf72B993AdC960773A0D"; // mec // works 50 sec
// const address = "0xdbcab7a768ea9a00b2ffa5a2eb387cad609e2114"; // Alpha kongs // does not work uri :https://storage.googleapis.com/alphakongclub/metadata/1 download ipfs file
// const address = "0x0d3669C118330B1990bFb416691982f342e5e9F0" // Wabi sabi // works 17 sec
// const address = "0xe1BD5802406D41160Aae5a2CD4943E5BA230bfff" // Super Fat // too many requests
// const address = "0x2b841d4b7ca08D45Cc3DE814de08850dC3008c43" // Skulltool // works https://skulltoons.s3.amazonaws.com/7697.json
// const address = "0xf61F24c2d93bF2dE187546B14425BF631F28d6dC" // wow // to check whats going over there
// const address = "0x2Dec96736E7d24e382e25D386457F490Ae64889e" // peaceful // works wrong calculation
// const address = "0x762Bc5880F128DCAc29cffdDe1Cf7DdF4cFC39Ee" // ??? // 9975 / 10K stops, need retry mechanism
// const address = "0xfa7e3f898c80e31a3aedeae8b0c713a3f9666264" // akuma // Works , 23 sec in office

// https://mainnet.infura.io/v3/ff83866dfc8a4786a3db399f1bf8af10 // Mine DEV
// https://mainnet.infura.io/v3/08e6d0e702084c7d9c7664a108369928 // Mine regular
// https://mainnet.infura.io/v3/ca05ad2cb2e449d19c2adb6bb0385702 // Nikita
const web3 = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io/v3/08e6d0e702084c7d9c7664a108369928'));

// var tokenContract = new web3.eth.Contract(tokenABI, address);
var tokenContract;

var keepaliveAgent = new https.Agent({
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 60000,
  keepAliveTimeout: 30000 // free socket keepalive for 30 seconds
});

var totalSupply;
var map = new Map();
var attributesMap = new Map();
var rarityMap = new Map();
var imageMap = new Map();
var failedTokens = new Set()
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

function parseData(res) {

  var legenderyArr = [];
  attributesMap.set("Legendary", legenderyArr);

  // Count attributes 

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

  fs.writeFile('results/NFT-stats.json', JSON.stringify(attributesMap, replacer), function (err) {
    if (err) return console.log(err);
  });

  // fs.writeFile('NFT-rarity-results.json', JSON.stringify(rarityMap, replacer), function (err) {
  //   if (err) return console.log(err);
  // });

  fs.writeFile('results/NFT-rarity-results.json', JSON.stringify(rarityArray, replacer), function (err) {
    if (err) return console.log(err);
  });

  fs.writeFile('results/NFT-available-results.json', JSON.stringify(availableNfts, replacer), function (err) {
    if (err) return console.log(err);
  });

  endTime = performance.now()
  console.log(`Method took ${(endTime - startTime) / 1000} seconds`)
  console.log("Done")
  res.json(rarityArray)
  clearData();

}

function countOfTrait(traitMap) {
  let sum = 0;
  traitMap.forEach(value => {
    sum += value;
  });
  return sum;
}

const fixMetaDataUrl = (metadataURL) => {
  if (!metadataURL.includes("http") && !metadataURL.includes("ipfs")) {
    metadataURL = "https://ipfs.io/ipfs/".concat(metadataURL);
  }
  else if (metadataURL.includes("ipfs://")) {
    metadataURL = metadataURL.replace("ipfs://", "https://ipfs.io/ipfs/")
  }
  return metadataURL;
}

const replaceIdWithToken = (metadataURL, firstToken) => {
  let slashIndex = metadataURL.lastIndexOf('/');
  let tokenIndex = metadataURL.lastIndexOf(firstToken);
  return metadataURL.replace(metadataURL.substring(slashIndex, tokenIndex + 1), "/TOKEN")
}

const clearData = () => {
  map = new Map();
  attributesMap = new Map();
  rarityMap = new Map();
  imageMap = new Map();
  failedTokens = new Set()
  moreThanOneAtt = 0;
  lessThanOneAtt = 0;
  legenderies = 0;
}

async function main(address, firstToken, res) {
  startTime = performance.now();
  tokenContract = new web3.eth.Contract(tokenABI, address);
  totalSupply = await tokenContract.methods.totalSupply().call();

  // let firstToken = 0; // 0 or 1
  let metadataURL = await tokenContract.methods.tokenURI(firstToken).call();
  metadataURL = fixMetaDataUrl(metadataURL);
  metadataURL = metadataURL.replace("/" + firstToken, "/TOKEN")
  // metadataURL = replaceIdWithToken(metadataURL, firstToken)
  console.log(metadataURL);

  for (let id = firstToken; id < parseInt(totalSupply) + firstToken; id++) {

    // let tempMetadataURL = await tokenContract.methods.tokenURI(id).call();
    let tempMetadataURL = metadataURL.replace("TOKEN", id);
    console.log(tempMetadataURL)

    var call = backoff.call(superAgentCall, tempMetadataURL, id, res, function (err, res) {
      console.log('Num retries: ' + call.getNumRetries());

      if (err) {
        console.log('Error: ' + err.message);
        fs.writeFile('Error-' + id + '.json', "aadafda", function (err) {
          if (err) return console.log(err);
        });
      } else {
        console.log('Status: ' + res.statusCode);
      }
    });

    call.retryIf(function (err) { return err.status == 504 || err.status == 503 || err.status == 404; });
    call.setStrategy(new backoff.FibonacciStrategy());
    call.failAfter(4);
    call.addListener("backoff", (number, delay, err) => {
      fs.writeFile('Error2-' + id + '.json', number + delay + err, function (err) {
        if (err) return console.log(err);
      });
    })
    call.start();

  }

}

function superAgentCall(metadataURL, id, res) {
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
          if (map.size == totalSupply) {
            parseData(res)
          }
        } catch (error) {
          console.log("Error with parsing : " + id + JSON.parse(response.text))
          failedTokens.add(id);
        }
      }
    })
}

const readOsDataNow = async () => {
  osList = await readOsData();
  console.log("Open sea items in variable")
}

// main();

app.get('/', async (req, res) => {
  readOsDataNow();
  await main(req.query.address, parseInt(req.query.firstToken), res);
})

app.listen(8080, () => {
  console.log(`Example app listening on port 8080`)
})