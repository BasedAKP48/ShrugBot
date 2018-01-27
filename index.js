const admin = require('firebase-admin');
const path = require('path');
const { Plugin, getReply } = require('@basedakp48/plugin-utils');

const DEFAULT_CONFIG = require("./defaultConfig.js");

const plugin = new Plugin({
  name: 'ShrugBot',
  cidPath: path.resolve('./cid.json'),
});

let configRef = admin.database().ref('/config/plugins').child(plugin.cid);
let config = DEFAULT_CONFIG;
let shrugTimes = {};

// track when we connect and disconnect to/from Firebase and log.
const presenceSystem = plugin.presenceSystem();
const messageSystem = plugin.messageSystem();

presenceSystem.on('connect', () => {
  console.log('connected to Firebase!');
});

presenceSystem.on('disconnect', () => {
  console.log('disconnected from Firebase!');
});

// get config from server. set config to default if server config doesn't exist.
configRef.on('value', (d) => {
  if(d.val()) {
    config = d.val();
  } else {
    d.ref.set(DEFAULT_CONFIG);
  }
});

messageSystem.on('message-in', (msg) => {
  if(!config) { return; } // We can't do anything without a config, so let's give up early.
  let text = msg.text.toLowerCase().split(' ');

  let sendCount = 0;

  for (let i = 0; i < text.length && sendCount < 2; i++) {
    let w = getWord(text[i]);
    if(w) {
      sendMessage(msg, w.output);
      sendCount++;
    }
  }
});

function getWord(word) {
  let wordList = config.words;
  for (let i = 0; i < wordList.length; i++) {
    if(word.toLowerCase().includes(wordList[i].name.toLowerCase())) {
      if(wordList[i].nomatch && word.toLowerCase().includes(wordList[i].nomatch.toLowerCase())) {
        return false;
      }
      return wordList[i];
    }
  }
  return false;
}

function canSend(cmd, to) {
  let times = shrugTimes[cmd];
  if(!times) {
    shrugTimes[cmd] = {};
    shrugTimes[cmd][to] = Date.now();
    return true;
  }
  if(!times[to]) {
    shrugTimes[cmd][to] = Date.now();
    return true;
  }
  if(Date.now() - times[to] > 15000) {
    shrugTimes[cmd][to] = Date.now();
    return true;
  }
  return false;
}

function sendMessage(msg, text) {
  if(!canSend(text, msg.channel)) { return; }
  let data = null;

  if (msg.data) {
    if (msg.data.connectorType === 'discord') {
      text = `\`${text}\``;
    }
    data = msg.data;
    data.pluginName = pkg.name;
    data.pluginInstance = cid;
  }

  let response = getReply(msg, cid, text, data);
  return messageSystem.sendMessage(response);
}
