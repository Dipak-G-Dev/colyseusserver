'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var Utils = require('../../Utils.js');

class RoomCache {
    clients = 0;
    locked = false;
    private = false;
    maxClients = Infinity;
    metadata;
    name;
    processId;
    roomId;
    createdAt;
    unlisted = false;
    $rooms;
    constructor(initialValues, rooms) {
        this.createdAt = new Date();
        for (const field in initialValues) {
            if (initialValues.hasOwnProperty(field)) {
                this[field] = initialValues[field];
            }
        }
        this.$rooms = rooms;
    }
    toJSON() {
        return {
            clients: this.clients,
            createdAt: this.createdAt,
            maxClients: this.maxClients,
            metadata: this.metadata,
            name: this.name,
            processId: this.processId,
            roomId: this.roomId,
        };
    }
    save() {
        if (this.$rooms.indexOf(this) === -1) {
            this.$rooms.push(this);
        }
    }
    updateOne(operations) {
        if (operations.$set) {
            for (const field in operations.$set) {
                if (operations.$set.hasOwnProperty(field)) {
                    this[field] = operations.$set[field];
                }
            }
        }
        if (operations.$inc) {
            for (const field in operations.$inc) {
                if (operations.$inc.hasOwnProperty(field)) {
                    this[field] += operations.$inc[field];
                }
            }
        }
    }
    remove() {
        //
        // WORKAROUND: prevent calling `.remove()` multiple times
        // Seems to happen during disconnect + dispose: https://github.com/colyseus/colyseus/issues/390
        //
        if (!this.$rooms) {
            return;
        }
        const roomIndex = this.$rooms.indexOf(this);
        if (roomIndex === -1) {
            return;
        }
        Utils.spliceOne(this.$rooms, roomIndex);
        this.$rooms = null;
    }
}

exports.RoomCache = RoomCache;
//# sourceMappingURL=RoomData.js.map
