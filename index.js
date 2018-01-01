const admin = require('firebase-admin');

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

let registryRef = rootRef.child('pluginRegistry').child(cid);
let presenceRef = registryRef.child('presence');
let config;
let shrugTimes = {};

// this is used to stop an initial 'disconnected' message from being sent.
let initialConn = false;

// track when we connect and disconnect to/from Firebase and log.
rootRef.child('.info/connected').on('value', (snapshot) => {
  if (snapshot.val() === true) {
    console.log('connected to Firebase!');
    initialConn = true;

    // on connect, set registryRef with information about the plugin
    registryRef.set({
      info: {
        pluginName: pkg.name,
        pluginVersion: pkg.version,
        pluginDepends: pkg.dependencies,
        instanceName: 'Shrugbot',
        listenMode: 'normal'
      }
    });

    // on connect, set presenceRef to connected status
    presenceRef.update({connected: true, lastConnect: admin.database.ServerValue.TIMESTAMP});
    // on disconnect, set presenceRef to disconnected status
    presenceRef.onDisconnect().update({connected: false, lastDisconnect: admin.database.ServerValue.TIMESTAMP});
  } else if (initialConn === true) {
    console.log('disconnected from Firebase!');
  }
});

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
