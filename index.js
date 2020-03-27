const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase,
  utils: { download }
} = require("matrix-puppet-bridge");
const Client = require('mattermost-client');
const config = require('./config.json');
const path = require('path');
const puppet = new Puppet(path.join(__dirname, './config.json'));
const debug = require('debug')('matrix-puppet:mattermost');
let fs = require('fs');
const request = require('request');
const emojis = require('./emojis.json');
const pattern = ":[a-z0-9\+\-\_]*:";
const smileys = {
  ":)": "\uD83D\uDE42",
  ":D": "\uD83D\uDE04",
  ";)": "\uD83D\uDE09",
  ":(": "\uD83D\uDE41",
  ":/": "\uD83D\uDE15",
  ":p": "\uD83D\uDE1B",
  ":P": "\uD83D\uDE1B",
  ":'(": "\uD83D\uDE22",
  "<3": "\u2764\uFE0F",
  "</3": "\uD83D\uDC94"
};

class App extends MatrixPuppetBridgeBase {
  getServicePrefix() {
    return "mattermost";
  }
  getServiceName() {
    return "Mattermost";
  }
  initThirdPartyClient() {
    this.thirdPartyClient = new Client(config.host, config.group, config.options);

    this.users = new Map();
    this.thirdPartyClient.on('profilesLoaded', data => {
      for (let i = 0; i < data.length; i++) {
        let user = data[i];
        user.userId = user.id;
        let senderName = user.username;
        if (user.first_name != "" || user.last_name != "")
          senderName = user.first_name + " " + user.last_name;
        user.senderName = senderName;
        user.name = senderName;
        const options =  {
          url: 'https://' + this.thirdPartyClient.host + '/api/v4/users/' + user.id + '/image',
          encoding: null
        };
        request(options, (error, response, body) => {
          user.avatar = { buffer: new Buffer.from(body), type: response.headers['content-type'] };
          this.users.set(data[i].id, user);
          this.joinThirdPartyUsersToStatusRoom([user]);
        }).auth(null, null, true, this.thirdPartyClient.token);
      }
    });

    this.myId = '';
    this.thirdPartyClient.on('meLoaded', data => {
      this.myId = data.id;
    });

    this.channels = new Map();
    this.thirdPartyClient.on('channelsLoaded', data => {
      console.log(data);
      for (let i = 0; i < data.length; i++) {
        this.channels.set(data[i].id, data[i]);
        this.getOrCreateMatrixRoomFromThirdPartyRoomId(data[i].id);
      }
    });

    this.thirdPartyClient.on('message', data => {
      const msg = JSON.parse(data.data.post);
      console.log(msg);
      // if(msg.user_id == this.myId) //we already have our own message
      //   return;
      if (msg.file_ids) {
        for (let i = 0; i < msg.file_ids.length; i++) {
          const options =  {
            url: 'https://' + this.thirdPartyClient.host + '/api/v4/files/' + msg.file_ids[i],
            encoding: null
          };
          request(options, (error, response, body) => {
            this.handleThirdPartyRoomMessageWithAttachment({ senderId: msg.user_id, roomId: msg.channel_id, text: "", senderName: message.sender_name, text: "", buffer: new Buffer.from(body), mimetype: response.headers['content-type'] });
          }).auth(null, null, true, this.thirdPartyClient.token);
        }
      }
      if (msg.message === '')
        return;
      let message = msg.message;
      while(message.match(pattern)) {
        const matches = message.match(pattern)[0].replace(":","").replace(":","");
          const emoji = emojis[matches];
          message = message.replace(":"+matches+":", (matched) =>{
            if(emoji)
              return String.fromCodePoint(parseInt (emoji, 16));
            return matches;
          });
      }
      for (const i in smileys) {
        const regex = new RegExp(i.replace(/([()[{*+.$^\\|?])/g, '\\$1'), 'gim');
        message = message.replace(regex, smileys[i]);
      }
      return this.handleThirdPartyRoomMessage({ senderId: msg.user_id, roomId: msg.channel_id, text: message, senderName: message.sender_name });
    });

    this.thirdPartyClient.on('typing', data => {
      const user_id = data.data.user_id;
      const channel_id = data.broadcast.channel_id;
      console.log('typing event', user_id, channel_id);
      this.handleTypingEvent(user_id, channel_id);
    });

    if (config.hasOwnProperty('token'))
      return this.thirdPartyClient.tokenLogin(config.token);
    else
      return this.thirdPartyClient.login(config.email, config.password);
  }

  async handleTypingEvent(user_id, channel_id) {
    try {
      const ghostIntent = await this.getIntentFromThirdPartySenderId(user_id);
      const matrixRoomId = await this.getOrCreateMatrixRoomFromThirdPartyRoomId(channel_id);
      // HACK: copy from matrix-appservice-bridge/lib/components/indent.js
      // client can get timeout value, but intent does not support this yet.
      await ghostIntent._ensureJoined(matrixRoomId);
      await ghostIntent._ensureHasPowerLevelFor(matrixRoomId, "m.typing");
      return ghostIntent.client.sendTyping(matrixRoomId, true, 5000);
    } catch (err) {
      debug('could not send typing event', err.message);
    }
  }

  getThirdPartyRoomDataById(id) {
    const channel = this.channels.get(id);
    let name = "";
    if (!channel)
      this.thirdPartyClient.loadChannels();
    if (channel)
      name = channel.display_name;
    let topic = "Mattermost Direct Message";

    switch (channel.type) {
      case "D":
        topic = "Mattermost Direct Message";
        break;
      case "O":
        topic = "Mattermost Public Channel";
        break;
      case "P":
        topic = "Mattermost Private Channel";
        break;
    }

    return { name: name, topic: topic };
  }

  getThirdPartyUserDataById(id) {
    if (!this.users.has(id))
      this.thirdPartyClient.loadAllUsers();
    return this.users.get(id);
  }

  sendReadReceiptAsPuppetToThirdPartyRoomWithId(id) { }

  sendTypingEventAsPuppetToThirdPartyRoomWithId(id, status) { }

  sendImageMessageAsPuppetToThirdPartyRoomWithId(id, data) {
    return this.sendFileMessageAsPuppetToThirdPartyRoomWithId(id, data);
  }

  sendFileMessageAsPuppetToThirdPartyRoomWithId(id, data) {
    return download.getTempfile(data.url, { tagFilename: true }).then(({ path }) => {
      let file = fs.createReadStream(path);
      const response = this.thirdPartyClient.uploadFile(id, file, (data) => {
        let msg = {
          message: "",
          file_ids: [data.file_infos[0].id]
        };
        return this.thirdPartyClient.postMessage(msg, id);
      });
    });
  }

  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    this.thirdPartyClient.postMessage(text, id);
  }

}

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: function (reg, callback) {
    puppet.associate().then(() => {
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart("mattermostbot");
      reg.addRegexPattern("users", "@mattermost_.*", true);
      reg.addRegexPattern("aliases", "#mattermost_.*", true);
      callback(reg);
    }).catch(err => {
      console.error(err.message);
      process.exit(-1);
    });
  },
  run: function (port) {
    const app = new App(config, puppet);
    console.log('starting matrix client');
    return puppet.startClient().then(() => {
      console.log('starting mattermost client');
      return app.initThirdPartyClient();
    }).then(() => {
      return app.bridge.run(port, config);
    }).then(() => {
      console.log('Matrix-side listening on port %s', port);
    }).catch(err => {
      console.error(err.message);
      process.exit(-1);
    });
  }
}).run();
