const admin = require('firebase-admin');

const DEFAULT_CONFIG = require("./defaultConfig.js");
const serviceAccount = require("./serviceAccount.json"); // TODO: Make this configurable on the command line.

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://basedakp48.firebaseio.com"
});

const rootRef = admin.database().ref();
let config;
let shrugTimes = {};

// TODO: Allow multiple configs for a plugin by keying under a unique ID.
rootRef.child('config/plugins/ShrugBot').on('value', (d) => {
  config = d.val();
  if(!config) {
    d.ref.set(DEFAULT_CONFIG);
    config = DEFAULT_CONFIG;
  }
  return;
});

rootRef.child('messages').orderByChild('timeReceived').startAt(Date.now()).on('child_added', (e) => {
  if(!config) { return; } // We can't do anything without a config, so let's give up early.
  let msg = e.val();
  console.log(msg);
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
  let response = {
    uid: 'ShrugBot',
    cid: msg.cid,
    text: text,
    channel: msg.channel,
    msgType: 'chatMessage',
    timeReceived: Date.now()
  }

  return rootRef.child('outgoingMessages').push().set(msg);
}