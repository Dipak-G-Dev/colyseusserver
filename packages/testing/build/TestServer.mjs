import { matchMaker } from '@colyseus/core';
import { Client } from 'colyseus.js';
import * as httpie from 'httpie';

class ColyseusTestServer {
    server;
    // matchmaking methods
    sdk;
    http;
    constructor(server) {
        this.server = server;
        const hostname = "127.0.0.1";
        const port = server['port'];
        const client = new Client(`ws://${hostname}:${port}`);
        const httpEndpoint = `http://${hostname}:${port}`;
        this.http = {
            ['get']: (segments, opts) => httpie.get(`${httpEndpoint}${segments}`, opts),
            ['post']: (segments, opts) => httpie.post(`${httpEndpoint}${segments}`, opts),
            ['patch']: (segments, opts) => httpie.patch(`${httpEndpoint}${segments}`, opts),
            ['delete']: (segments, opts) => httpie.del(`${httpEndpoint}${segments}`, opts),
            ['put']: (segments, opts) => httpie.put(`${httpEndpoint}${segments}`, opts),
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
        const room = await matchMaker.createRoom(roomName, clientOptions);
        return this.getRoomById(room.roomId);
    }
    connectTo(room, clientOptions = {}) {
        return this.sdk.joinById(room.roomId, clientOptions);
    }
    getRoomById(roomId) {
        return matchMaker.getRoomById(roomId);
    }
    async cleanup() {
        // ensure no rooms are still alive
        await matchMaker.disconnectAll();
        const driver = this.server['driver'];
        if (driver) {
            await driver.clear();
        }
    }
    async shutdown() {
        await this.server.gracefullyShutdown(false);
    }
}

export { ColyseusTestServer };
//# sourceMappingURL=TestServer.mjs.map
