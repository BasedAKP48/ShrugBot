const admin = require('firebase-admin');
const { PresenceSystem } = require('basedakp48-plugin-utils');

const DEFAULT_CONFIG = require("./defaultConfig.js");
const serviceAccount = require("./serviceAccount.json"); // TODO: Make this configurable on the command line.
const pkg = require('./package.json');
let cid;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://basedakp48.firebaseio.com"
});

const rootRef = admin.database().ref();

try {
  cid = require('./cid.json');
} catch (e) {
  let fs = require('fs');
  cid = rootRef.child('pluginRegistry').push().key;
  fs.writeFileSync('./cid.json', JSON.stringify(cid), {encoding: 'UTF-8'});
}

let configRef = rootRef.child('config/plugins').child(cid);
let config = DEFAULT_CONFIG;
let shrugTimes = {};

// this is used to stop an initial 'disconnected' message from being sent.
let initialConn = false;

// track when we connect and disconnect to/from Firebase and log.
const presenceSystem = new PresenceSystem();
presenceSystem.on('connect', () => {
  console.log('connected to Firebase!');
});
presenceSystem.on('disconnect', () => {
  console.log('disconnected from Firebase!');
});
presenceSystem.initialize({
  rootRef,
  cid,
  pkg,
  instanceName: 'ShrugBot',
});

// get config from server. set config to default if server config doesn't exist.
configRef.on('value', (d) => {
  if(d.val()) {
    config = d.val();
  } else {
    d.ref.set(DEFAULT_CONFIG);
  }
});

rootRef.child('messages').orderByChild('timeReceived').startAt(Date.now()).on('child_added', (e) => {
  if(!config) { return; } // We can't do anything without a config, so let's give up early.
  let msg = e.val();
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
  let extra_client_info = null;

  if (msg.extra_client_info) {
    if (msg.extra_client_info.connectorType === 'discord') {
      text = `\`${text}\``;
    }
    extra_client_info = msg.extra_client_info;
    extra_client_info.pluginName = pkg.name;
    extra_client_info.pluginInstance = cid;
  }

  let response = {
    uid: cid,
    target: msg.cid,
    text: text,
    channel: msg.channel,
    type: 'text',
    direction: 'out',
    timeReceived: Date.now(),
    extra_client_info
  }

  return rootRef.child('pendingMessages').push().set(response);
}
