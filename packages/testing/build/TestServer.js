'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var core = require('@colyseus/core');
var colyseus_js = require('colyseus.js');
var httpie = require('httpie');

function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () {
                        return e[k];
                    }
                });
            }
        });
    }
    n['default'] = e;
    return Object.freeze(n);
}

var httpie__namespace = /*#__PURE__*/_interopNamespace(httpie);

class ColyseusTestServer {
    server;
    // matchmaking methods
    sdk;
    http;
    constructor(server) {
        this.server = server;
        const hostname = "127.0.0.1";
        const port = server['port'];
        const client = new colyseus_js.Client(`ws://${hostname}:${port}`);
        const httpEndpoint = `http://${hostname}:${port}`;
        this.http = {
            ['get']: (segments, opts) => httpie__namespace.get(`${httpEndpoint}${segments}`, opts),
            ['post']: (segments, opts) => httpie__namespace.post(`${httpEndpoint}${segments}`, opts),
            ['patch']: (segments, opts) => httpie__namespace.patch(`${httpEndpoint}${segments}`, opts),
            ['delete']: (segments, opts) => httpie__namespace.del(`${httpEndpoint}${segments}`, opts),
            ['put']: (segments, opts) => httpie__namespace.put(`${httpEndpoint}${segments}`, opts),
        };
        this.sdk = {
            joinOrCreate: function () {
                return client.joinOrCreate.apply(client, arguments);
            },
            join: client.join.bind(client),
            create: client.create.bind(client),
            joinById: client.joinById.bind(client),
            reconnect: client.reconnect.bind(client),
        };
    }
    async createRoom(roomName, clientOptions = {}) {
        const room = await core.matchMaker.createRoom(roomName, clientOptions);
        return this.getRoomById(room.roomId);
    }
    connectTo(room, clientOptions = {}) {
        return this.sdk.joinById(room.roomId, clientOptions);
    }
    getRoomById(roomId) {
        return core.matchMaker.getRoomById(roomId);
    }
    async cleanup() {
        // ensure no rooms are still alive
        await core.matchMaker.disconnectAll();
        const driver = this.server['driver'];
        if (driver) {
            await driver.clear();
        }
    }
    async shutdown() {
        await this.server.gracefullyShutdown(false);
    }
}

exports.ColyseusTestServer = ColyseusTestServer;
//# sourceMappingURL=TestServer.js.map
