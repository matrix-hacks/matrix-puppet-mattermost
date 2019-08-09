const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const Client = require('mattermost-client');
const config = require('./config.json');
const path = require('path');
const puppet = new Puppet(path.join(__dirname, './config.json' ));
const debug = require('debug')('matrix-puppet:mattermost');

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
      for(let i=0; i<data.length; i++) {
        let user = data[i];
        user.userId = user.id;
        let senderName = user.username;
        if(user.first_name != "" || user.last_name != "")
          senderName = user.first_name + " " + user.last_name;
        user.senderName = senderName;
        user.name = senderName;
        this.users.set(data[i].id, data[i]);
        this.joinThirdPartyUsersToStatusRoom([user]);
      }
    });

    this.channels = new Map();
    this.thirdPartyClient.on('channelsLoaded', data => {
      for(let i=0; i<data.length; i++) {
        this.channels.set(data[i].id, data[i]);
        this.getOrCreateMatrixRoomFromThirdPartyRoomId(data[i].id);
      }
    });

    this.thirdPartyClient.on('message', message => {
      const msg = JSON.parse(message.data.post);
      return this.handleThirdPartyRoomMessage({senderId: msg.user_id, roomId: msg.channel_id, text: msg.message, senderName: message.sender_name});
    });

    return this.thirdPartyClient.login(config.email, config.password);
  }

  getThirdPartyRoomDataById(id) {
    const channel = this.channels.get(id);
    let name = "";
    if(channel.display_name)
      name = channel.display_name;
    let topic = "Mattermost Direct Message";

    switch(channel.type) {
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

    return {name: name, topic: topic};
  }

  getThirdPartyUserDataById(id) {
    return this.users.get(id);;
  }

  sendReadReceiptAsPuppetToThirdPartyRoomWithId(id) {}
    
  sendTypingEventAsPuppetToThirdPartyRoomWithId(id, status) {}

  sendImageMessageAsPuppetToThirdPartyRoomWithId(id, data) {}

  sendFileMessageAsPuppetToThirdPartyRoomWithId(id, data) {}

  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    this.thirdPartyClient.postMessage(text, id);
  }

}

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: function(reg, callback) {
    puppet.associate().then(()=>{
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart("mattermost");
      reg.addRegexPattern("users", "@mattermost_.*", true);
      reg.addRegexPattern("aliases", "#mattermost_.*", true);
      callback(reg);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  },
  run: function(port) {
    const app = new App(config, puppet);
    console.log('starting matrix client');
    return puppet.startClient().then(()=>{
      console.log('starting mattermost client');
      return app.initThirdPartyClient();
    }).then(()=>{
      return app.bridge.run(port, config);
    }).then(()=>{
      console.log('Matrix-side listening on port %s', port);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  }
}).run();
