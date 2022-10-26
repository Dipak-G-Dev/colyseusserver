class RoomData {
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
    #client;
    constructor(initialValues, client) {
        this.#client = client;
        this.createdAt = initialValues.createdAt
            ? new Date(initialValues.createdAt)
            : new Date();
        for (const field in initialValues) {
            if (initialValues.hasOwnProperty(field)) {
                this[field] = initialValues[field];
            }
        }
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
    async save() {
        if (this.roomId) {
            // FIXME: workaround so JSON.stringify() stringifies all dynamic fields.
            const toJSON = this.toJSON;
            this.toJSON = undefined;
            const roomcache = JSON.stringify(this);
            this.toJSON = toJSON;
            await this.hset('roomcaches', this.roomId, roomcache);
        }
        else {
            console.warn("⚠️ RedisDriver: can't .save() without a `roomId`");
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
        return this.save();
    }
    remove() {
        if (this.roomId) {
            return this.hdel('roomcaches', this.roomId);
        }
    }
    hset(key, field, value) {
        return new Promise((resolve, reject) => {
            this.#client.hset(key, field, value, function (err, res) {
                if (err) {
                    return reject(err);
                }
                resolve(res);
            });
        });
    }
    hdel(key, field) {
        return new Promise((resolve, reject) => {
            this.#client.hdel(key, field, function (err, res) {
                if (err) {
                    return reject(err);
                }
                resolve(res);
            });
        });
    }
}

export { RoomData };
//# sourceMappingURL=RoomData.mjs.map
