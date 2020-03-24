# matrix-puppet-mattermost [![#matrix-puppet-bridge:matrix.org](https://img.shields.io/matrix/matrix-puppet-bridge:matrix.org.svg?label=%23matrix-puppet-bridge%3Amatrix.org&logo=matrix&server_fqdn=matrix.org)](https://matrix.to/#/#matrix-puppet-bridge:matrix.org)

This is a Matrix bridge for [Mattermost](https://mattermost.com/).

It's based on [mattermost-client](https://github.com/loafoe/mattermost-client), a Node.js client that uses the official Mattermost v4 API.

## Features

- [x] login to your Mattermost account
- [x] send text messages to channel you subscribed to (group, public, direct)
- [x] user sync
- [x] channel sync
- [x] receive text messages
- [x] receive typing events
- [x] send files
- [x] receive files
- [x] support default emojis of mattermost (translating to unicode)

So the basic functionality should work but there is a lot of stuff like attachments, edits, quoting, events (user x joined, user y left) that may be added in the future.

## requirements

- Node.js installed on the system that runs the bridge.
- An existing account on a Mattermost server.

## installation

clone this repo

cd into the directory

run `npm install`

## configure

Copy `config.sample.json` to `config.json` and update it to match your setup

## register the app service

Generate an `mattermost-registration.yaml` file with `node index.js -r -u "http://your-bridge-server:8090"`

Note: The 'registration' setting in the config.json needs to set to the path of this file. By default, it already is.

Copy this `mattermost-registration.yaml` file to your home server, then edit it, setting its url to point to your bridge server. e.g. `url: 'http://your-bridge-server.example.org:8090'`

Edit your homeserver.yaml file and update the `app_service_config_files` with the path to the `imessage-registration.yaml` file.

Restart your HS.

Launch the bridge with `start.sh` or `node index.js`. If you want to run the bridge as a service you can use the `matrix-puppet-signal.service` file as a template for every systemd based operating system.

## Discussion, Help and Support

Join us in the [![Matrix Puppet Bridge](https://user-images.githubusercontent.com/13843293/52007839-4b2f6580-24c7-11e9-9a6c-14d8fc0d0737.png)](https://matrix.to/#/#matrix-puppet-bridge:matrix.org) room
