const Web3 = require('web3');
const path = require("path");
const fs = require('fs');
const http = require('https');
const axios = require('axios');
//


const tokenABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "tokenABI.json")));

const address = "0x469823c7B84264D1BAfBcD6010e9cdf1cac305a3"; // bulls
// const address = "0xeb6DffB87315a2BdF4dedf72B993AdC960773A0D"; // mec
// const address = "0xdbcab7a768ea9a00b2ffa5a2eb387cad609e2114"; // Alpha kongs
// const address = "0x0d3669C118330B1990bFb416691982f342e5e9F0" // Wabi sabi
// const address = "0xe1BD5802406D41160Aae5a2CD4943E5BA230bfff" // Super Fat
// const address ="0x2b841d4b7ca08D45Cc3DE814de08850dC3008c43" // Skulltool
// const address = "0xf61F24c2d93bF2dE187546B14425BF631F28d6dC" // wow
// const address = "0x2Dec96736E7d24e382e25D386457F490Ae64889e" // peaceful
// const address = "0x762Bc5880F128DCAc29cffdDe1Cf7DdF4cFC39Ee" // ???

// https://mainnet.infura.io/v3/ff83866dfc8a4786a3db399f1bf8af10 // Mine DEV
// https://mainnet.infura.io/v3/08e6d0e702084c7d9c7664a108369928 // Mine regular
// https://mainnet.infura.io/v3/ca05ad2cb2e449d19c2adb6bb0385702 // Nikita
const web3 = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io/v3/ff83866dfc8a4786a3db399f1bf8af10'));

const tokenContract = new web3.eth.Contract(tokenABI, address);

var totalSupply;
var threadNum;
var remainderNum;

const map = new Map();
const attributesMap = new Map();
var rarityMap = new Map();
var imageMap = new Map();
var moreThanOneAtt = 0;
var lessThanOneAtt = 0;
var legenderies = 0;
var startTime;
var endTime;

var osList;

// http.globalAgent.keepAliveMsecs = 10000
// http.globalAgent.maxFreeSockets = 2560
// http.globalAgent.maxCachedSessions = 1000
// http.globalAgent.defaultPort = 592
http.globalAgent.keepAlive = true;

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
    try {
      // id = id -1; // if token start on 0
      let metadataURL = await tokenContract.methods.tokenURI(id).call();
      console.log(metadataURL)
      // metadataURL=  metadataURL.replace("ipfs://","https://ipfs.io/ipfs/"); // if its like ipfs://skfhksfafakfjhf

      const file = fs.createWriteStream("json/" + id + ".json");

      const request = http.get(metadataURL, function (response) {
        var stream = response.pipe(file);
        stream.on('finish', function () {
          parseData(id);
        });
      });
    } catch (e) {
      console.log("Error With token : " + id)
      continue;
    }


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

function parseData(id) {

  fs.readFile("json/" + id + ".json", 'utf8', function (err, data) {
    if (err) {
      console.log("error here :" + id)
      throw err
    };
    // console.log(id)
    // console.log(JSON.parse(data))
    let parsedData
    console.log("before : "+id +JSON.stringify(data));
    parsedData = JSON.parse(data);
    console.log("after : "+id+JSON.stringify(parsedData))
    let attr = parsedData.attributes;
    imageMap.set(id, parsedData.image);
    map.set(id, attr);
    // console.log("Parsed data: " + JSON.stringify(parsedData))
    // console.log("attributes: " + attr)

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
  });
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


