import fossilDelta from 'fossil-delta';
import msgpack from 'notepack.io';
import { Protocol, debugPatch } from '@colyseus/core';
import jsonPatch from 'fast-json-patch';

class FossilDeltaSerializer {
    id = 'fossil-delta';
    // when a new user connects, it receives the 'previousState', which holds
    // the last binary snapshot other users already have, therefore the patches
    // that follow will be the same for all clients.
    previousState;
    previousStateEncoded;
    patches;
    reset(newState) {
        this.previousState = newState;
        this.previousStateEncoded = msgpack.encode(this.previousState);
    }
    getFullState(_) {
        return this.previousStateEncoded;
    }
    applyPatches(clients, previousState) {
        const hasChanged = this.hasChanged(previousState);
        if (hasChanged) {
            this.patches.unshift(Protocol.ROOM_STATE_PATCH);
            let numClients = clients.length;
            while (numClients--) {
                const client = clients[numClients];
                client.enqueueRaw(this.patches);
            }
        }
        return hasChanged;
    }
    hasChanged(newState) {
        const currentState = newState;
        let changed = false;
        let currentStateEncoded;
        /**
         * allow optimized state changes when using `Schema` class.
         */
        if (newState?.['$changes']) { // tslint:disable-line
            if (newState['$changes'].changes.size > 0) { // tslint:disable-line
                changed = true;
                currentStateEncoded = msgpack.encode(currentState);
            }
        }
        else {
            currentStateEncoded = msgpack.encode(currentState);
            changed = !currentStateEncoded.equals(this.previousStateEncoded);
        }
        if (changed) {
            this.patches = fossilDelta.create(this.previousStateEncoded, currentStateEncoded);
            //
            // debugging
            //
            if (debugPatch.enabled) {
                debugPatch('%d bytes, %j', this.patches.length, jsonPatch.compare(msgpack.decode(this.previousStateEncoded), currentState));
            }
            this.previousState = currentState;
            this.previousStateEncoded = currentStateEncoded;
        }
        return changed;
    }
}

export { FossilDeltaSerializer };
//# sourceMappingURL=index.mjs.map
